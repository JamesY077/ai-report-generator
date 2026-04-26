import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  LevelFormat,
  convertInchesToTwip,
} from 'docx';
import { saveAs } from 'file-saver';
import type { OutlineNode, Version } from '../types';

const NUMBERING_REF = 'ordered-list';

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

function getHeadingLevel(level: number): typeof HeadingLevel[keyof typeof HeadingLevel] {
  switch (level) {
    case 1: return HeadingLevel.HEADING_1;
    case 2: return HeadingLevel.HEADING_2;
    case 3: return HeadingLevel.HEADING_3;
    default: return HeadingLevel.HEADING_4;
  }
}

function parseMarkdownToRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  for (const part of parts) {
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    } else if (part) {
      runs.push(new TextRun({ text: part }));
    }
  }
  return runs.length ? runs : [new TextRun({ text })];
}

function contentToParagraphs(content: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      paragraphs.push(new Paragraph({ text: '' }));
      continue;
    }

    // Markdown heading lines inside content (### or ##) → bold paragraph
    if (trimmed.startsWith('### ')) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed.slice(4), bold: true, size: 26 })],
          spacing: { before: 200, after: 100, line: 360 },
        })
      );
    } else if (trimmed.startsWith('## ')) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed.slice(3), bold: true, size: 28 })],
          spacing: { before: 240, after: 120, line: 360 },
        })
      );
    } else if (trimmed.startsWith('# ')) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: trimmed.slice(2), bold: true, size: 30 })],
          spacing: { before: 280, after: 140, line: 360 },
        })
      );
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('• ') || trimmed.startsWith('* ')) {
      // Unordered list
      paragraphs.push(
        new Paragraph({
          children: parseMarkdownToRuns(trimmed.slice(2)),
          bullet: { level: 0 },
          spacing: { line: 360 },
        })
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      // Ordered list → use numbering reference defined in Document
      paragraphs.push(
        new Paragraph({
          children: parseMarkdownToRuns(trimmed.replace(/^\d+\.\s/, '')),
          numbering: { reference: NUMBERING_REF, level: 0 },
          spacing: { line: 360 },
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          children: parseMarkdownToRuns(trimmed),
          alignment: AlignmentType.JUSTIFIED,
          spacing: { line: 360, before: 80, after: 80 },
        })
      );
    }
  }

  return paragraphs;
}

export async function exportToDocx(
  theme: string,
  outline: OutlineNode[],
  version: Version,
  versionNum: number
): Promise<void> {
  const flatList = flattenOutline(outline);
  const children: Paragraph[] = [];

  // 封面标题
  children.push(
    new Paragraph({
      text: theme,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { before: 2000, after: 400 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `版本 ${versionNum}  |  字数：${version.wordCount.toLocaleString()} 字`,
          color: '888888',
          size: 22,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 2000 },
    })
  );

  // 分页
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 目录标题
  children.push(
    new Paragraph({
      text: '目  录',
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 400 },
    })
  );

  // 目录列表
  for (const node of flatList) {
    const indentTwip = (node.level - 1) * convertInchesToTwip(0.3);
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: node.title,
            bold: node.level === 1,
            size: node.level === 1 ? 24 : 22,
          }),
        ],
        indent: { left: indentTwip },
        spacing: { before: 80, after: 80, line: 320 },
      })
    );
  }

  // 分页进入正文
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // 正文内容
  for (const node of flatList) {
    children.push(
      new Paragraph({
        text: node.title,
        heading: getHeadingLevel(node.level),
        spacing: { before: node.level === 1 ? 600 : 300, after: 200 },
        pageBreakBefore: node.level === 1,
      })
    );

    const content = version.content[node.id] || '';
    if (content) {
      const contentParas = contentToParagraphs(content);
      children.push(...contentParas);
    }
  }

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: NUMBERING_REF,
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: {
                paragraph: {
                  indent: {
                    left: convertInchesToTwip(0.5),
                    hanging: convertInchesToTwip(0.25),
                  },
                },
              },
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {},
        children,
      },
    ],
    styles: {
      default: {
        document: {
          run: {
            font: '宋体',
            size: 24,
          },
          paragraph: {
            spacing: { line: 360 },
          },
        },
      },
    },
  });

  const blob = await Packer.toBlob(doc);
  const filename = `${theme}_v${versionNum}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '')}.docx`;
  saveAs(blob, filename);
}
