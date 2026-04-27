import axios from 'axios';
import type { AIConfig, OutlineNode } from '../types';

export const AI_REQUEST_TIMEOUT_MS = 5 * 60 * 1000;
export const AI_REQUEST_TIMEOUT_LABEL = '5分钟';

// 创建带超时的 fetch（5分钟），支持外部 AbortSignal
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = AI_REQUEST_TIMEOUT_MS,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // 如果外部传入了 signal，监听它并同步中止
  let externalAbortHandler: (() => void) | null = null;
  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId);
      throw new DOMException('用户已取消', 'AbortError');
    }
    externalAbortHandler = () => controller.abort();
    externalSignal.addEventListener('abort', externalAbortHandler);
  }

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      // 区分用户取消和超时
      if (externalSignal?.aborted) {
        throw new DOMException('用户已取消生成', 'AbortError');
      }
      throw new Error(`AI 请求超过${AI_REQUEST_TIMEOUT_LABEL}未完成，请稍后重试`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (externalSignal && externalAbortHandler) {
      externalSignal.removeEventListener('abort', externalAbortHandler);
    }
  }
}

// 将大纲树展平为有序列表
function flattenOutline(nodes: OutlineNode[]): OutlineNode[] {
  const result: OutlineNode[] = [];
  function traverse(list: OutlineNode[]) {
    for (const node of list) {
      result.push(node);
      if (node.children?.length) traverse(node.children);
    }
  }
  traverse(nodes);
  return result;
}

// 将大纲树转为文本
function outlineToText(nodes: OutlineNode[], indent = 0): string {
  return nodes
    .map((n) => {
      const prefix = '  '.repeat(indent) + (indent === 0 ? '# ' : indent === 1 ? '## ' : '### ');
      const children = n.children?.length ? '\n' + outlineToText(n.children, indent + 1) : '';
      return prefix + n.title + children;
    })
    .join('\n');
}

function getChildTitles(node: OutlineNode | undefined): string {
  if (!node?.children?.length) return '无';
  return node.children.map((child) => `- ${child.title}`).join('\n');
}

function getSectionRoleInstruction(node: OutlineNode | undefined, targetWordCount: number, leafCount: number): {
  role: string;
  wordCount: number;
  instruction: string;
} {
  if (node?.children?.length) {
    const wordCount = node.level === 1 ? 300 : 220;
    return {
      role: '概述章节',
      wordCount,
      instruction: `当前章节是非叶子章节，下级章节包括：
${getChildTitles(node)}

请只撰写本章节的整体概括、背景引入、逻辑铺垫和承上启下内容。不要展开下级章节的具体论证，不要提前生成下级章节正文，不要罗列下级章节的完整内容，避免与后续章节重复。`,
    };
  }

  return {
    role: '正文详述章节',
    wordCount: Math.floor(targetWordCount / Math.max(leafCount, 1)),
    instruction: '当前章节是叶子章节，请围绕该章节标题展开完整、细致、可直接用于报告正文的分析论述。',
  };
}

function cleanJsonText(text: string): string {
  return text
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

function findJsonSegments(text: string, opening: '[' | '{', closing: ']' | '}'): string[] {
  const segments: string[] = [];

  for (let start = text.indexOf(opening); start >= 0; start = text.indexOf(opening, start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i += 1) {
      const char = text[i];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === '\\') {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
      } else if (char === opening) {
        depth += 1;
      } else if (char === closing) {
        depth -= 1;
        if (depth === 0) {
          segments.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }

  return segments;
}

function parseJsonFromText(text: string): unknown {
  const cleaned = cleanJsonText(text);
  const candidates = [
    cleaned,
    cleaned.replace(
      /("(?:chapter|section|subsection|number|index)"\s*:\s*)(\d+(?:\.\d+)+)(?=\s*[,}])/g,
      '$1"$2"'
    ),
  ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue with segment extraction.
    }
  }

  for (const [opening, closing] of [['[', ']'], ['{', '}']] as const) {
    for (const segment of findJsonSegments(cleaned, opening, closing)) {
      const segmentCandidates = [
        segment,
        segment.replace(
          /("(?:chapter|section|subsection|number|index)"\s*:\s*)(\d+(?:\.\d+)+)(?=\s*[,}])/g,
          '$1"$2"'
        ),
      ];

      for (const candidate of segmentCandidates) {
        try {
          return JSON.parse(candidate);
        } catch {
          // Try the next JSON segment.
        }
      }
    }
  }

  throw new Error(`AI 返回格式错误，原始内容：${text.slice(0, 200)}`);
}

function getOutlinePayload(parsed: unknown): unknown {
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    return record.outline ?? record.structure ?? record.chapters ?? record.sections ?? record.data ?? record.result;
  }
  return parsed;
}

function normalizeOutlineNodes(
  value: unknown,
  level = 1,
  parentId: string | null = null,
  path: number[] = []
): OutlineNode[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];

    const record = item as Record<string, unknown>;
    const rawTitle = record.title ?? record.name ?? record.heading ?? record.chapterTitle ?? record.sectionTitle;
    const title = typeof rawTitle === 'string' ? rawTitle.trim() : '';
    if (!title) return [];

    const nodePath = [...path, index + 1];
    const id = typeof record.id === 'string' && record.id.trim()
      ? record.id.trim()
      : `sec_${nodePath.join('_')}`;
    const normalizedLevel = typeof record.level === 'number' && Number.isFinite(record.level)
      ? Math.max(1, Math.min(3, Math.trunc(record.level)))
      : level;
    const rawChildren = record.children ?? record.sections ?? record.subsections ?? record.items;
    const children = normalizeOutlineNodes(
      rawChildren,
      Math.min(normalizedLevel + 1, 3),
      id,
      nodePath
    );

    return [{
      id,
      title,
      level: normalizedLevel,
      parentId,
      children,
    }];
  });
}

function parseOutlineResponse(text: string): OutlineNode[] {
  const parsed = parseJsonFromText(text);
  const normalized = normalizeOutlineNodes(getOutlinePayload(parsed));
  if (normalized.length === 0) {
    throw new Error('AI 返回了空大纲或缺少章节标题，请重试');
  }
  return normalized;
}

class AIService {
  private config: AIConfig | null = null;

  setConfig(config: AIConfig) {
    this.config = config;
  }

  private getHeaders() {
    if (!this.config) throw new Error('AI 配置未设置');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.config.apiKey}`,
    };
  }

  private getBaseUrl() {
    if (!this.config) throw new Error('AI 配置未设置');
    return this.config.baseUrl.replace(/\/$/, '');
  }

  private getModel() {
    return this.config?.model || 'gpt-4o';
  }

  private async streamChatCompletion(
    prompt: string,
    onChunk?: (chunk: string) => void,
    temperature = 0.7,
    signal?: AbortSignal
  ): Promise<string> {
    const response = await fetchWithTimeout(
      `${this.getBaseUrl()}/chat/completions`,
      {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.getModel(),
          messages: [{ role: 'user', content: prompt }],
          temperature,
          stream: true,
        }),
      },
      AI_REQUEST_TIMEOUT_MS,
      signal
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error('AI 返回为空，请重试');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    const consumeLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;

      const data = trimmed.slice(5).trim();
      if (!data || data === '[DONE]') return;

      try {
        const parsed = JSON.parse(data);
        const choice = parsed.choices?.[0];
        const delta = choice?.delta?.content ?? choice?.message?.content ?? choice?.text ?? '';
        if (typeof delta === 'string' && delta) {
          fullText += delta;
          onChunk?.(delta);
        }
      } catch {
        // Some providers may split packets in unusual places; the line buffer handles normal SSE packet splits.
      }
    };

    while (true) {
      // 检查外部取消信号
      if (signal?.aborted) {
        reader.cancel();
        throw new DOMException('用户已取消生成', 'AbortError');
      }

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      lines.forEach(consumeLine);
    }

    buffer += decoder.decode();
    buffer.split(/\r?\n/).forEach(consumeLine);

    if (!fullText.trim()) throw new Error('AI 返回了空内容，请重试');
    return fullText;
  }

  /** 测试连接 */
  async testConnection(): Promise<boolean> {
    try {
      const res = await axios.post(
        `${this.getBaseUrl()}/chat/completions`,
        {
          model: this.getModel(),
          messages: [{ role: 'user', content: '你好，请回复"连接成功"' }],
          max_tokens: 20,
        },
        { headers: this.getHeaders(), timeout: AI_REQUEST_TIMEOUT_MS }
      );
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /** 生成大纲（流式，实时回调原始文本） */
  async generateOutline(
    theme: string,
    requirements: string,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<OutlineNode[]> {
    const prompt = `你是一位专业的报告撰写专家。请根据以下信息生成一份结构化的报告大纲。

报告主题：${theme}
具体要求：${requirements}

请生成一份完整的报告大纲，要求：
1. 包含3-6个一级章节
2. 每个一级章节下包含2-4个二级小节
3. 部分小节可以有三级子节
4. 以JSON格式返回，格式如下：
[
  {
    "id": "sec_1",
    "title": "第一章 章节名称",
    "level": 1,
    "parentId": null,
    "children": [
      {
        "id": "sec_1_1",
        "title": "1.1 小节名称",
        "level": 2,
        "parentId": "sec_1",
        "children": []
      }
    ]
  }
]

只返回JSON数组，不要有其他文字。必须严格使用 id/title/level/parentId/children 这5个字段，不要使用 chapter、section、subsection、sections、subsections 等字段；章节编号请写在 title 字符串里，不要单独输出数字编号字段。`;

    if (onChunk) {
      // 流式模式
      const fullText = await this.streamChatCompletion(prompt, onChunk, 0.7, signal);
      return parseOutlineResponse(fullText);
    } else {
      // 非流式兜底
      const res = await axios.post(
        `${this.getBaseUrl()}/chat/completions`,
        {
          model: this.getModel(),
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
        },
        { headers: this.getHeaders(), timeout: AI_REQUEST_TIMEOUT_MS }
      );
      const text: string = res.data.choices[0].message.content;
      return parseOutlineResponse(text);
    }
  }

  /** 根据对话修改大纲 */
  async refineOutline(
    currentOutline: OutlineNode[],
    userRequest: string,
    theme: string,
    onChunk?: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<OutlineNode[]> {
    const outlineText = outlineToText(currentOutline);
    const prompt = `你是一位专业的报告撰写专家。当前报告主题为"${theme}"，现有大纲如下：

${outlineText}

用户的修改要求：${userRequest}

请根据用户要求修改大纲，并以JSON格式返回完整的新大纲（格式与之前相同）。
重要：只返回JSON数组本身，不要包含任何markdown代码块标记（不要有\`\`\`json或\`\`\`），不要有任何其他文字说明。必须严格使用 id/title/level/parentId/children 这5个字段，不要使用 chapter、section、subsection、sections、subsections 等字段；章节编号请写在 title 字符串里，不要单独输出数字编号字段。`;

    return parseOutlineResponse(await this.streamChatCompletion(prompt, onChunk, 0.7, signal));
  }

  /** 生成单个章节内容（流式） */
  async generateSectionContent(
    sectionTitle: string,
    theme: string,
    outline: OutlineNode[],
    targetWordCount: number,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const outlineText = outlineToText(outline);
    const flatList = flattenOutline(outline);
    // 只统计叶子节点（无子节点的章节）来分配字数，更合理
    const leafSections = flatList.filter((n) => !n.children?.length);
    const leafCount = Math.max(leafSections.length, 1);
    const currentNode = flatList.find((n) => n.title === sectionTitle);
    const sectionProfile = getSectionRoleInstruction(currentNode, targetWordCount, leafCount);

    const prompt = `你是一位专业的报告撰写专家。请严格按照以下要求，为指定章节撰写详细的正文内容。

【报告主题】${theme}

【完整大纲结构】
${outlineText}

【当前撰写章节】${sectionTitle}

【章节类型】${sectionProfile.role}

【章节处理规则】
${sectionProfile.instruction}

【字数要求】本章节需撰写约 ${sectionProfile.wordCount} 字。

【撰写要求】
1. 本章节内容必须紧扣章节标题"${sectionTitle}"，围绕该章节的具体主题展开，不得写成通用结论或摘要
2. 内容专业、严谨，符合标准论文或正式研究报告的正文表达
3. 语言流畅，逻辑清晰，段落结构合理，避免口语化
4. 直接输出正文内容，不要重复章节标题
5. 禁止使用 Markdown 格式，禁止出现 #、**加粗**、项目符号列表、表格、代码块等格式标记
6. 禁止生成与其他章节重复的内容，本章节有其独特的论述角度
7. 请使用普通段落输出，段落之间可以换行，但不要添加额外小标题

请直接开始撰写"${sectionTitle}"的正文内容：`;

    return this.streamChatCompletion(prompt, onChunk, 0.7, signal);
  }

  /** 刷新单个章节 */
  async refreshSection(
    sectionTitle: string,
    theme: string,
    outline: OutlineNode[],
    prevContent: string,
    nextContent: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const flatList = flattenOutline(outline);
    const currentNode = flatList.find((n) => n.title === sectionTitle);
    const leafSections = flatList.filter((n) => !n.children?.length);
    const sectionProfile = getSectionRoleInstruction(currentNode, 15000, Math.max(leafSections.length, 1));
    const prompt = `你是一位专业的报告撰写专家。请重新撰写以下章节的内容。

报告主题：${theme}
章节标题：${sectionTitle}
章节类型：${sectionProfile.role}
章节处理规则：
${sectionProfile.instruction}
${prevContent ? `上一章节内容摘要：${prevContent.slice(0, 200)}...` : ''}
${nextContent ? `下一章节内容摘要：${nextContent.slice(0, 200)}...` : ''}

要求：
1. 内容与主题和标题高度相关
2. 与前后章节保持连贯
3. 语言专业、严谨，符合标准论文或正式研究报告的正文表达
4. 直接输出内容，不要重复标题
5. 禁止使用 Markdown 格式，禁止出现 #、**加粗**、项目符号列表、表格、代码块等格式标记
6. 使用普通段落输出，不要添加额外小标题`;

    return this.streamChatCompletion(prompt, onChunk, 0.8, signal);
  }

  /** 根据用户建议优化章节 */
  async optimizeSection(
    sectionTitle: string,
    currentContent: string,
    userSuggestion: string,
    theme: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const prompt = `你是一位专业的报告撰写专家。请根据用户建议优化以下章节内容。

报告主题：${theme}
章节标题：${sectionTitle}
当前内容：
${currentContent}

用户建议：${userSuggestion}

请根据建议重新撰写该章节，保持与主题的相关性，直接输出优化后的内容。
要求：语言专业、严谨，符合标准论文或正式研究报告的正文表达。禁止使用 Markdown 格式，禁止出现 #、**加粗**、项目符号列表、表格、代码块等格式标记。使用普通段落输出，不要添加额外小标题。`;

    return this.streamChatCompletion(prompt, onChunk, 0.7, signal);
  }

  /** 根据整体要求迭代单个章节，避免父章节重复生成子章节内容 */
  async iterateSectionContent(
    section: OutlineNode,
    theme: string,
    outline: OutlineNode[],
    currentContent: string,
    newRequirements: string,
    onChunk: (chunk: string) => void,
    signal?: AbortSignal
  ): Promise<string> {
    const flatList = flattenOutline(outline);
    const leafSections = flatList.filter((n) => !n.children?.length);
    const sectionProfile = getSectionRoleInstruction(section, 15000, Math.max(leafSections.length, 1));
    const prompt = `你是一位专业的报告撰写专家。请根据新的整体要求，优化以下单个章节内容。

【报告主题】${theme}

【当前章节】${section.title}

【章节类型】${sectionProfile.role}

【章节处理规则】
${sectionProfile.instruction}

【当前章节内容】
${currentContent}

【整体优化要求】
${newRequirements}

【输出要求】
1. 只输出当前章节"${section.title}"的优化后正文，不要输出其他章节内容
2. 如果当前章节是非叶子章节，只写整体概括、逻辑铺垫和承上启下，不要展开下级章节正文
3. 如果当前章节是叶子章节，请完整展开该章节的具体分析
4. 语言专业、严谨，符合标准论文或正式研究报告的正文表达
5. 禁止使用 Markdown 格式，禁止出现 #、**加粗**、项目符号列表、表格、代码块等格式标记
6. 使用普通段落输出，不要重复章节标题，不要添加额外小标题`;

    return this.streamChatCompletion(prompt, onChunk, 0.7, signal);
  }

  /** 全文版本迭代优化（流式），支持取消 */
  async iterateVersion(
    theme: string,
    outline: OutlineNode[],
    currentContent: Record<string, string>,
    newRequirements: string,
    onProgress: (sectionId: string, content: string) => void,
    signal?: AbortSignal
  ): Promise<Record<string, string>> {
    const flatList = flattenOutline(outline);
    const newContent: Record<string, string> = {};

    for (const section of flatList) {
      // 每个章节开始前检查取消信号
      if (signal?.aborted) {
        throw new DOMException('用户已取消生成', 'AbortError');
      }

      const current = currentContent[section.id] || '';
      const prompt = `你是一位专业的报告撰写专家。请根据新的整体要求，优化以下章节内容。

报告主题：${theme}
章节标题：${section.title}
当前内容：
${current}

整体优化要求：${newRequirements}

请根据要求重新撰写该章节，直接输出优化后的内容，不要重复标题。`;

      let sectionContent = '';
      await this.streamChatCompletion(prompt, (chunk) => {
        sectionContent += chunk;
        onProgress(section.id, sectionContent);
      }, 0.7, signal);
      newContent[section.id] = sectionContent;
    }

    return newContent;
  }
}

export const aiService = new AIService();
export { flattenOutline, outlineToText };
