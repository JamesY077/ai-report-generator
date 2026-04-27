import { useState, useRef, useEffect } from 'react';
import {
  Button, Typography, Input, Spin, message, Tooltip, Badge, Tag, Modal, Space,
  Progress, Drawer, Checkbox, Divider
} from 'antd';
import {
  ReloadOutlined, SendOutlined, MenuFoldOutlined, MenuUnfoldOutlined,
  CheckCircleOutlined, RocketOutlined, ExportOutlined, StopOutlined,
  LoadingOutlined, LeftOutlined, RightOutlined, SwapOutlined,
  ColumnWidthOutlined, HistoryOutlined, DownloadOutlined
} from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { useAppDispatch, useAppSelector } from '../hooks/useAppDispatch';
import { setStage, setActiveSection, setLeftPanelCollapsed, setAIConfig } from '../store/appSlice';
import { updateVersionContent, addVersion, setCurrentVersion } from '../store/projectSlice';
import { aiService } from '../services/aiService';
import { flattenOutline } from '../services/aiService';
import type { OutlineNode, AIConfig, Version } from '../types';

const { Text, Link } = Typography;
const { TextArea } = Input;

// ─────────────────────────────────────────────
// 左侧大纲导航
// ─────────────────────────────────────────────
function OutlineNav({
  nodes,
  activeId,
  onSelect,
  level = 0,
}: {
  nodes: OutlineNode[];
  activeId: string;
  onSelect: (id: string) => void;
  level?: number;
}) {
  return (
    <div>
      {nodes.map((node) => (
        <div key={node.id}>
          <div
            onClick={() => onSelect(node.id)}
            style={{
              padding: `6px ${8 + level * 12}px`,
              cursor: 'pointer',
              borderRadius: 6,
              marginBottom: 2,
              background: activeId === node.id ? '#ede9fe' : 'transparent',
              borderLeft: activeId === node.id ? '3px solid #667eea' : '3px solid transparent',
              color: activeId === node.id ? '#667eea' : node.level === 1 ? '#222' : '#555',
              fontWeight: node.level === 1 ? 600 : 400,
              fontSize: node.level === 1 ? 13 : 12,
              transition: 'all 0.15s',
            }}
          >
            {node.title}
          </div>
          {node.children?.length > 0 && (
            <OutlineNav nodes={node.children} activeId={activeId} onSelect={onSelect} level={level + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────
// 单个章节卡片（优化页主视图）
// ─────────────────────────────────────────────
function SectionCard({
  node,
  content,
  theme,
  outline,
  onContentUpdate,
}: {
  node: OutlineNode;
  content: string;
  theme: string;
  outline: OutlineNode[];
  onContentUpdate: (id: string, content: string) => void;
}) {
  const dispatch = useAppDispatch();
  const [refreshing, setRefreshing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [suggestion, setSuggestion] = useState('');
  const [optimizeModel, setOptimizeModel] = useState('');
  const [checkingModel, setCheckingModel] = useState(false);
  const [displayContent, setDisplayContent] = useState(content);
  const aiConfig = useAppSelector((s) => s.app.aiConfig);
  const flatList = flattenOutline(outline);

  const refreshAbortRef = useRef<AbortController | null>(null);
  const optimizeAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setDisplayContent(content);
  }, [content]);

  const getSectionOptimizeConfig = async (): Promise<AIConfig | null> => {
    const model = optimizeModel.trim() || aiConfig.model;
    const nextConfig: AIConfig = { ...aiConfig, model };

    if (!optimizeModel.trim() || model === aiConfig.model) {
      return nextConfig;
    }

    setCheckingModel(true);
    try {
      aiService.setConfig(nextConfig);
      const ok = await aiService.testConnection();
      if (!ok) {
        message.error('模型验证失败，请检查模型名称、Base URL 和 API Key');
        return null;
      }
      dispatch(setAIConfig(nextConfig));
      message.success(`模型 ${model} 可用`);
      return nextConfig;
    } catch (e) {
      message.error('模型验证失败：' + (e instanceof Error ? e.message : '未知错误'));
      return null;
    } finally {
      setCheckingModel(false);
    }
  };

  const handleCheckModel = async () => {
    if (!optimizeModel.trim()) {
      message.info(`未填写模型时将默认使用当前整体模型：${aiConfig.model}`);
      return;
    }
    await getSectionOptimizeConfig();
  };

  const handleCancelRefresh = () => {
    refreshAbortRef.current?.abort();
    refreshAbortRef.current = null;
    setRefreshing(false);
    setDisplayContent(content);
    message.info('已取消刷新');
  };

  const handleCancelOptimize = () => {
    optimizeAbortRef.current?.abort();
    optimizeAbortRef.current = null;
    setOptimizing(false);
    setDisplayContent(content);
    message.info('已取消优化');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setDisplayContent('');
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    try {
      aiService.setConfig(aiConfig);
      const idx = flatList.findIndex((n) => n.id === node.id);
      const prevContent = idx > 0 ? (flatList[idx - 1] ? content : '') : '';
      const nextContent = idx < flatList.length - 1 ? '' : '';
      let newContent = '';
      await aiService.refreshSection(
        node.title, theme, outline, prevContent, nextContent,
        (chunk) => {
          newContent += chunk;
          setDisplayContent(newContent);
        },
        controller.signal
      );
      onContentUpdate(node.id, newContent);
      message.success('章节已刷新');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      message.error('刷新失败：' + (e instanceof Error ? e.message : '未知错误'));
      setDisplayContent(content);
    } finally {
      setRefreshing(false);
      refreshAbortRef.current = null;
    }
  };

  const handleOptimize = async () => {
    if (!suggestion.trim()) {
      message.warning('请输入优化建议');
      return;
    }
    setOptimizing(true);
    const prevContent = displayContent;
    setDisplayContent('');
    const controller = new AbortController();
    optimizeAbortRef.current = controller;
    try {
      const optimizeConfig = await getSectionOptimizeConfig();
      if (!optimizeConfig) {
        setDisplayContent(prevContent);
        return;
      }
      aiService.setConfig(optimizeConfig);
      let newContent = '';
      await aiService.optimizeSection(
        node.title, prevContent, suggestion, theme,
        (chunk) => {
          newContent += chunk;
          setDisplayContent(newContent);
        },
        controller.signal
      );
      onContentUpdate(node.id, newContent);
      setSuggestion('');
      message.success('章节已优化');
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
      message.error('优化失败：' + (e instanceof Error ? e.message : '未知错误'));
      setDisplayContent(prevContent);
    } finally {
      setOptimizing(false);
      optimizeAbortRef.current = null;
    }
  };

  const headingStyle: Record<number, React.CSSProperties> = {
    1: { fontSize: 20, fontWeight: 700, color: '#1a1a2e', borderBottom: '2px solid #667eea', paddingBottom: 8, marginBottom: 16 },
    2: { fontSize: 17, fontWeight: 600, color: '#333', marginBottom: 12 },
    3: { fontSize: 15, fontWeight: 600, color: '#555', marginBottom: 8 },
  };

  return (
    <div
      id={`section-${node.id}`}
      style={{
        marginBottom: 32,
        background: '#fff',
        borderRadius: 12,
        padding: 24,
        boxShadow: '0 2px 12px rgba(0,0,0,0.06)',
        border: '1px solid #f0f0f0',
      }}
    >
      {/* 标题行 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={headingStyle[node.level] || headingStyle[3]}>
          {node.title}
        </div>
        {refreshing ? (
          <Button size="small" danger icon={<StopOutlined />} onClick={handleCancelRefresh}>
            取消刷新
          </Button>
        ) : (
          <Tooltip title="重新生成本章节">
            <Button
              size="small"
              icon={<ReloadOutlined />}
              onClick={handleRefresh}
              disabled={optimizing}
              style={{ borderColor: '#667eea', color: '#667eea' }}
            >
              刷新
            </Button>
          </Tooltip>
        )}
      </div>

      {/* 内容区 */}
      <div style={{ minHeight: 80, lineHeight: 1.8, color: '#333', fontSize: 14 }}>
        {(refreshing || optimizing) && displayContent === '' ? (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Spin /> <span style={{ marginLeft: 8, color: '#888' }}>AI 正在生成...</span>
          </div>
        ) : (
          <ReactMarkdown>{displayContent || '*（暂无内容）*'}</ReactMarkdown>
        )}
      </div>

      {/* 优化建议输入 */}
      <div style={{
        marginTop: 16,
        padding: '12px 16px',
        background: '#f8f9ff',
        borderRadius: 8,
        border: '1px solid #e8e8ff',
      }}>
        <Text style={{ fontSize: 12, color: '#888', display: 'block', marginBottom: 8 }}>
          💡 对本章节有修改建议？输入后点击优化
        </Text>
        <Space.Compact style={{ width: '100%', marginBottom: 8 }}>
          <Input
            value={optimizeModel}
            onChange={(e) => setOptimizeModel(e.target.value)}
            placeholder={`本段优化模型，留空默认：${aiConfig.model}`}
            size="small"
            disabled={refreshing || optimizing || checkingModel}
          />
          <Button
            size="small"
            onClick={handleCheckModel}
            loading={checkingModel}
            disabled={refreshing || optimizing}
          >
            验证模型
          </Button>
        </Space.Compact>
        {optimizing ? (
          <Button danger block icon={<StopOutlined />} onClick={handleCancelOptimize}>
            取消优化
          </Button>
        ) : (
          <Space.Compact style={{ width: '100%' }}>
            <TextArea
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              placeholder="例如：增加更多数据支撑，语言更学术化..."
              autoSize={{ minRows: 1, maxRows: 3 }}
              style={{ fontSize: 13 }}
              disabled={refreshing}
            />
            <Button
              type="primary"
              icon={<SendOutlined />}
              onClick={handleOptimize}
              loading={optimizing || checkingModel}
              disabled={refreshing}
              style={{ background: '#667eea', border: 'none', height: 'auto' }}
            >
              优化
            </Button>
          </Space.Compact>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 对比视图：单章节内容列（只读，支持勾选）
// ─────────────────────────────────────────────
function CompareColumn({
  label,
  labelColor,
  nodes,
  content,
  activeId,
  scrollRef,
  generating,
  generatingId,
  selectable,
  selectedIds,
  onToggleSelect,
}: {
  label: string;
  labelColor: string;
  nodes: OutlineNode[];
  content: Record<string, string>;
  activeId: string;
  scrollRef: React.RefObject<HTMLDivElement>;
  generating?: boolean;
  generatingId?: string;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (id: string) => void;
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* 列标题 */}
      <div style={{
        padding: '10px 20px',
        background: labelColor,
        color: '#fff',
        fontWeight: 600,
        fontSize: 14,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {label}
        {generating && <LoadingOutlined />}
        {selectable && (
          <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 400, opacity: 0.9 }}>
            ← 勾选要应用的章节
          </span>
        )}
      </div>
      {/* 内容滚动区 */}
      <div
        ref={scrollRef}
        style={{ flex: 1, overflow: 'auto', padding: '20px 24px', background: '#f5f6fa' }}
      >
        {nodes.map((node) => {
          const isGeneratingThis = generating && generatingId === node.id;
          const isSelected = selectedIds?.has(node.id) ?? false;
          return (
            <div
              key={node.id}
              id={`compare-${label}-section-${node.id}`}
              style={{
                marginBottom: 24,
                background: '#fff',
                borderRadius: 10,
                padding: '16px 20px',
                boxShadow: isSelected
                  ? '0 0 0 2px #52c41a, 0 4px 16px rgba(82,196,26,0.15)'
                  : activeId === node.id
                    ? '0 0 0 2px #667eea, 0 4px 16px rgba(102,126,234,0.15)'
                    : '0 2px 8px rgba(0,0,0,0.05)',
                border: isSelected
                  ? '1px solid #52c41a'
                  : activeId === node.id ? '1px solid #667eea' : '1px solid #f0f0f0',
                transition: 'box-shadow 0.2s, border 0.2s',
                cursor: selectable ? 'pointer' : 'default',
              }}
              onClick={() => selectable && onToggleSelect?.(node.id)}
            >
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
                paddingBottom: 8,
                borderBottom: '1px solid #f0f0f0',
              }}>
                {selectable && (
                  <Checkbox
                    checked={isSelected}
                    onChange={() => onToggleSelect?.(node.id)}
                    onClick={(e) => e.stopPropagation()}
                    style={{ flexShrink: 0 }}
                  />
                )}
                <div style={{
                  fontSize: node.level === 1 ? 16 : node.level === 2 ? 14 : 13,
                  fontWeight: node.level === 1 ? 700 : 600,
                  color: '#333',
                  flex: 1,
                }}>
                  {node.title}
                </div>
                {isSelected && (
                  <Tag color="success" style={{ fontSize: 11 }}>已选择</Tag>
                )}
              </div>
              <div style={{ lineHeight: 1.8, fontSize: 13, color: '#444' }}>
                {isGeneratingThis ? (
                  <div>
                    <ReactMarkdown>{content[node.id] || ''}</ReactMarkdown>
                    <span style={{
                      display: 'inline-block', width: 2, height: '1em',
                      background: '#667eea', marginLeft: 2,
                      verticalAlign: 'text-bottom',
                      animation: 'blink 1s step-end infinite',
                    }} />
                  </div>
                ) : (
                  <ReactMarkdown>{content[node.id] || '*（暂无内容）*'}</ReactMarkdown>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 迭代对比页面（全屏）
// ─────────────────────────────────────────────
function IterateComparePage({
  outline,
  v1Content,
  projectTheme,
  currentVersion,
  currentContent,
  iterateRequirements,
  aiConfig,
  onComplete,
  onCancel,
}: {
  outline: OutlineNode[];
  v1Content: Record<string, string>;
  projectTheme: string;
  currentVersion: number;
  currentContent: Record<string, string>;
  iterateRequirements: string;
  aiConfig: AIConfig;
  onComplete: (newContent: Record<string, string>, selectedIds: Set<string>) => void;
  onCancel: () => void;
}) {
  const flatList = flattenOutline(outline);

  const [newContent, setNewContent] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(true);
  const [generatingId, setGeneratingId] = useState('');
  const [progress, setProgress] = useState({ completed: 0, total: flatList.length });
  const [done, setDone] = useState(false);
  // 取消确认弹窗
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // 大纲侧边栏
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);
  const [activeId, setActiveId] = useState('');

  // 章节选择（生成完成后可用）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const abortRef = useRef<AbortController | null>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const rightScrollRef = useRef<HTMLDivElement>(null);

  // 大纲导航点击
  const handleNavSelect = (id: string) => {
    setActiveId(id);
    const newVersionLabel = `V${currentVersion + 1}`;
    [
      { prefix: 'compare-V1（原版）-section-', ref: leftScrollRef },
      { prefix: `compare-${newVersionLabel}（新版）-section-`, ref: rightScrollRef },
    ].forEach(({ prefix, ref }) => {
      const el = document.getElementById(prefix + id);
      const container = ref.current;
      if (el && container) {
        const containerTop = container.getBoundingClientRect().top;
        const elTop = el.getBoundingClientRect().top;
        const offset = elTop - containerTop + container.scrollTop - 16;
        container.scrollTo({ top: offset, behavior: 'smooth' });
      }
    });
  };

  // 开始生成
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        aiService.setConfig(aiConfig);

        for (let i = 0; i < flatList.length; i++) {
          if (controller.signal.aborted) break;
          const section = flatList[i];
          setGeneratingId(section.id);
          setProgress({ completed: i, total: flatList.length });

          const current = currentContent[section.id] || '';
          let sectionContent = '';
          await aiService.iterateSectionContent(
            section,
            projectTheme,
            outline,
            current,
            iterateRequirements,
            (chunk) => {
              sectionContent += chunk;
              setNewContent((prev) => ({ ...prev, [section.id]: sectionContent }));
            },
            controller.signal
          );
        }

        if (!controller.signal.aborted) {
          setProgress({ completed: flatList.length, total: flatList.length });
          setDone(true);
          setGenerating(false);
          setGeneratingId('');
          // 默认全选
          setSelectedIds(new Set(flatList.map((n) => n.id)));
        }
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          // 被取消：停止生成，但不自动显示"已取消"状态
          // 用户通过确认弹窗主动取消，此处只停止生成
          setGenerating(false);
          setGeneratingId('');
          // 如果已有部分内容，也默认全选已生成的
          setSelectedIds(new Set(Object.keys(newContent)));
        } else {
          message.error('迭代失败：' + (e instanceof Error ? e.message : '未知错误'));
          setGenerating(false);
          setGeneratingId('');
        }
      }
    })();

    return () => {
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 点击取消按钮 → 弹出确认弹窗
  const handleClickCancel = () => {
    setShowCancelConfirm(true);
  };

  // 确认取消生成
  const handleConfirmCancel = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setShowCancelConfirm(false);
    // 如果已有部分内容，进入选择模式；否则直接返回
    if (Object.keys(newContent).length > 0) {
      setDone(false); // 不是完整完成，但可以选择
      setSelectedIds(new Set(Object.keys(newContent)));
    } else {
      onCancel();
    }
  };

  // 章节勾选切换
  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 全选 / 全不选
  const handleSelectAll = () => {
    const available = Object.keys(newContent);
    if (selectedIds.size === available.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(available));
    }
  };

  // 确认应用选中章节
  const handleApply = () => {
    if (selectedIds.size === 0) {
      message.warning('请至少选择一个章节');
      return;
    }
    onComplete(newContent, selectedIds);
  };

  const progressPercent = progress.total > 0
    ? Math.round((progress.completed / progress.total) * 100)
    : 0;

  const newVersionLabel = `V${currentVersion + 1}`;
  const generatedCount = Object.keys(newContent).length;
  const isSelectionMode = !generating && generatedCount > 0;
  const allAvailableSelected = generatedCount > 0 && selectedIds.size === generatedCount;

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', flexDirection: 'column' }}>
      {/* 顶部工具栏 */}
      <div style={{
        padding: '10px 20px',
        borderBottom: '1px solid #e8e8e8',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0,
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Tooltip title={outlineCollapsed ? '展开大纲' : '收起大纲'}>
            <Button
              size="small"
              type="text"
              icon={outlineCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setOutlineCollapsed(!outlineCollapsed)}
            />
          </Tooltip>
          <SwapOutlined style={{ color: '#667eea' }} />
          <Text strong style={{ fontSize: 14 }}>{projectTheme}</Text>
          <Tag color="blue">V1（原版）</Tag>
          <Text style={{ color: '#aaa' }}>vs</Text>
          <Tag color="purple">{newVersionLabel}（新版）</Tag>
          {generating && (
            <Space size={6}>
              <LoadingOutlined style={{ color: '#667eea' }} />
              <Text style={{ color: '#667eea', fontSize: 12 }}>
                正在生成第 {progress.completed + 1}/{progress.total} 章...
              </Text>
            </Space>
          )}
          {done && (
            <Tag color="success" icon={<CheckCircleOutlined />}>生成完成，请选择要应用的章节</Tag>
          )}
          {!generating && !done && generatedCount > 0 && (
            <Tag color="warning">已生成 {generatedCount}/{flatList.length} 章，请选择要应用的章节</Tag>
          )}
        </div>
        <Space>
          {/* 生成中：取消按钮 */}
          {generating && (
            <Button danger icon={<StopOutlined />} onClick={handleClickCancel}>
              取消生成
            </Button>
          )}
          {/* 选择模式：全选/全不选 + 确认应用 */}
          {isSelectionMode && (
            <>
              <Button
                size="small"
                onClick={handleSelectAll}
                style={{ borderColor: '#667eea', color: '#667eea' }}
              >
                {allAvailableSelected ? '全不选' : '全选'}
              </Button>
              <Tag style={{ margin: 0, padding: '2px 8px' }}>
                已选 {selectedIds.size}/{generatedCount} 章
              </Tag>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleApply}
                disabled={selectedIds.size === 0}
                style={{ background: 'linear-gradient(135deg, #52c41a, #389e0d)', border: 'none' }}
              >
                确认应用选中章节
              </Button>
            </>
          )}
          <Button icon={<LeftOutlined />} onClick={onCancel}>
            返回
          </Button>
        </Space>
      </div>

      {/* 进度条（生成中显示） */}
      {generating && (
        <div style={{ flexShrink: 0, padding: '0 20px' }}>
          <Progress
            percent={progressPercent}
            strokeColor={{ '0%': '#667eea', '100%': '#764ba2' }}
            status="active"
            size="small"
            style={{ margin: '6px 0' }}
          />
        </div>
      )}

      {/* 生成完成提示条 */}
      {done && (
        <div style={{
          flexShrink: 0,
          padding: '10px 20px',
          background: 'linear-gradient(135deg, #f0fff4, #e6ffed)',
          borderBottom: '1px solid #b7eb8f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Space>
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 16 }} />
            <Text style={{ color: '#389e0d', fontWeight: 600 }}>
              {newVersionLabel} 已生成完成！在右侧勾选要替换的章节，然后点击"确认应用选中章节"。
            </Text>
          </Space>
          <Space>
            <Button
              size="small"
              onClick={handleSelectAll}
              style={{ borderColor: '#52c41a', color: '#52c41a' }}
            >
              {allAvailableSelected ? '全不选' : '全选所有章节'}
            </Button>
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={handleApply}
              disabled={selectedIds.size === 0}
              style={{ background: '#52c41a', border: 'none' }}
            >
              确认应用（{selectedIds.size} 章）
            </Button>
          </Space>
        </div>
      )}

      {/* 取消后提示条（有部分内容时） */}
      {!generating && !done && generatedCount > 0 && (
        <div style={{
          flexShrink: 0,
          padding: '10px 20px',
          background: '#fffbe6',
          borderBottom: '1px solid #ffe58f',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <Text style={{ color: '#d48806' }}>
            已完成 {generatedCount}/{flatList.length} 章。可在右侧勾选要应用的章节。
          </Text>
          <Space>
            <Button
              size="small"
              onClick={handleSelectAll}
              style={{ borderColor: '#faad14', color: '#faad14' }}
            >
              {allAvailableSelected ? '全不选' : '全选已生成'}
            </Button>
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={handleApply}
              disabled={selectedIds.size === 0}
              style={{ background: '#faad14', border: 'none' }}
            >
              应用选中章节（{selectedIds.size} 章）
            </Button>
          </Space>
        </div>
      )}

      {/* 主体：大纲 + 双列对比 */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* 大纲侧边栏 */}
        {!outlineCollapsed && (
          <div style={{
            width: 220,
            borderRight: '1px solid #e8e8e8',
            background: '#fafafa',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            flexShrink: 0,
          }}>
            <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid #f0f0f0' }}>
              <Text strong style={{ fontSize: 12 }}>📋 大纲导航</Text>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 6px' }}>
              <OutlineNav nodes={outline} activeId={activeId} onSelect={handleNavSelect} />
            </div>
          </div>
        )}

        {/* 双列对比区 */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* 左列：V1 */}
          <CompareColumn
            label="V1（原版）"
            labelColor="linear-gradient(135deg, #667eea, #764ba2)"
            nodes={flatList}
            content={v1Content}
            activeId={activeId}
            scrollRef={leftScrollRef as React.RefObject<HTMLDivElement>}
          />

          {/* 分隔线 */}
          <div style={{ width: 1, background: '#e8e8e8', flexShrink: 0, position: 'relative' }}>
            <div style={{
              position: 'absolute', top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              background: '#fff', border: '1px solid #e8e8e8',
              borderRadius: '50%', width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1,
            }}>
              <ColumnWidthOutlined style={{ fontSize: 12, color: '#aaa' }} />
            </div>
          </div>

          {/* 右列：新版本（可勾选） */}
          <CompareColumn
            label={`${newVersionLabel}（新版）`}
            labelColor="linear-gradient(135deg, #11998e, #38ef7d)"
            nodes={flatList}
            content={newContent}
            activeId={activeId}
            scrollRef={rightScrollRef as React.RefObject<HTMLDivElement>}
            generating={generating}
            generatingId={generatingId}
            selectable={isSelectionMode}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
          />
        </div>
      </div>

      {/* 取消确认弹窗 */}
      <Modal
        title={<Space><StopOutlined style={{ color: '#ff4d4f' }} /><span>确认取消生成？</span></Space>}
        open={showCancelConfirm}
        onCancel={() => setShowCancelConfirm(false)}
        footer={[
          <Button key="back" onClick={() => setShowCancelConfirm(false)}>
            继续生成
          </Button>,
          <Button key="cancel" danger onClick={handleConfirmCancel}>
            {generatedCount > 0 ? `取消并使用已生成的 ${generatedCount} 章` : '取消并返回'}
          </Button>,
        ]}
        width={420}
      >
        <Text style={{ color: '#666' }}>
          {generatedCount > 0
            ? `当前已生成 ${generatedCount}/${flatList.length} 个章节。取消后，您仍可选择应用已生成的章节。`
            : '尚未生成任何章节，取消后将直接返回。'}
        </Text>
      </Modal>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}

// ─────────────────────────────────────────────
// 历史版本抽屉
// ─────────────────────────────────────────────
function HistoryDrawer({
  open,
  onClose,
  versions,
  currentVersion,
  outline,
  onSwitchVersion,
  onExportVersion,
}: {
  open: boolean;
  onClose: () => void;
  versions: Version[];
  currentVersion: number;
  outline: OutlineNode[];
  onSwitchVersion: (v: number) => void;
  onExportVersion: (v: number) => void;
}) {
  const [expandedVersion, setExpandedVersion] = useState<number | null>(null);
  const flatList = flattenOutline(outline);

  return (
    <Drawer
      title={
        <Space>
          <HistoryOutlined style={{ color: '#667eea' }} />
          <span>历史版本</span>
          <Tag color="purple">{versions.length} 个版本</Tag>
        </Space>
      }
      placement="right"
      width={400}
      open={open}
      onClose={onClose}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[...versions].reverse().map((v) => {
          const isCurrent = v.version === currentVersion;
          const isExpanded = expandedVersion === v.version;
          return (
            <div
              key={v.version}
              style={{
                border: isCurrent ? '2px solid #667eea' : '1px solid #e8e8e8',
                borderRadius: 10,
                overflow: 'hidden',
                background: isCurrent ? '#f5f3ff' : '#fff',
              }}
            >
              {/* 版本头部 */}
              <div style={{
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
              }}
                onClick={() => setExpandedVersion(isExpanded ? null : v.version)}
              >
                <Space>
                  <Tag color={isCurrent ? 'purple' : 'default'} style={{ fontWeight: 600 }}>
                    V{v.version}
                  </Tag>
                  {isCurrent && <Tag color="blue" style={{ fontSize: 11 }}>当前版本</Tag>}
                  <Text style={{ fontSize: 12, color: '#888' }}>
                    {v.wordCount.toLocaleString()} 字
                  </Text>
                </Space>
                <Text style={{ fontSize: 11, color: '#bbb' }}>
                  {isExpanded ? '▲' : '▼'}
                </Text>
              </div>

              {/* 版本需求说明 */}
              {v.requirements && (
                <div style={{ padding: '0 16px 8px', fontSize: 12, color: '#888' }}>
                  📝 {v.requirements}
                </div>
              )}

              {/* 展开：章节预览 */}
              {isExpanded && (
                <div style={{
                  maxHeight: 300,
                  overflow: 'auto',
                  padding: '8px 16px',
                  borderTop: '1px solid #f0f0f0',
                  background: '#fafafa',
                }}>
                  {flatList.map((node) => (
                    <div key={node.id} style={{ marginBottom: 12 }}>
                      <Text strong style={{ fontSize: 12, color: '#555' }}>{node.title}</Text>
                      <div style={{
                        fontSize: 12, color: '#888', lineHeight: 1.6,
                        marginTop: 4,
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                      }}>
                        {(v.content[node.id] || '').replace(/[#*`]/g, '').slice(0, 120)}...
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Divider style={{ margin: 0 }} />

              {/* 操作按钮 */}
              <div style={{ padding: '10px 16px', display: 'flex', gap: 8 }}>
                {!isCurrent && (
                  <Button
                    size="small"
                    type="primary"
                    ghost
                    onClick={() => { onSwitchVersion(v.version); onClose(); }}
                    style={{ flex: 1 }}
                  >
                    切换到此版本
                  </Button>
                )}
                <Button
                  size="small"
                  icon={<DownloadOutlined />}
                  onClick={() => onExportVersion(v.version)}
                  style={{
                    flex: 1,
                    borderColor: '#11998e',
                    color: '#11998e',
                  }}
                >
                  导出此版本
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Drawer>
  );
}

// ─────────────────────────────────────────────
// 主页面：OptimizePage
// ─────────────────────────────────────────────
export default function OptimizePage() {
  const dispatch = useAppDispatch();
  const aiConfig = useAppSelector((s) => s.app.aiConfig);
  const outline = useAppSelector((s) => s.project.outline);
  const versions = useAppSelector((s) => s.project.versions);
  const currentVersion = useAppSelector((s) => s.project.currentVersion);
  const projectInfo = useAppSelector((s) => s.project.projectInfo);
  const activeSection = useAppSelector((s) => s.app.activeSection);
  const leftPanelCollapsed = useAppSelector((s) => s.app.leftPanelCollapsed);
  const userPreferences = useAppSelector((s) => s.app.userPreferences);

  const [iterateInput, setIterateInput] = useState('');
  const [iterateModel, setIterateModel] = useState(aiConfig.model);
  const [checkingIterateModel, setCheckingIterateModel] = useState(false);
  const [compareAIConfig, setCompareAIConfig] = useState<AIConfig | null>(null);
  const [showIterateModal, setShowIterateModal] = useState(false);
  const [showComparePage, setShowComparePage] = useState(false);
  const [pendingRequirements, setPendingRequirements] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const contentAreaRef = useRef<HTMLDivElement>(null);

  const currentVersionData = versions.find((v) => v.version === currentVersion);
  const v1Data = versions.find((v) => v.version === 1);
  const flatList = flattenOutline(outline);

  const handleContentUpdate = (sectionId: string, content: string) => {
    dispatch(updateVersionContent({ version: currentVersion, sectionId, content }));
  };

  const handleNavSelect = (id: string) => {
    dispatch(setActiveSection(id));
    const el = document.getElementById(`section-${id}`);
    const container = contentAreaRef.current;
    if (el && container) {
      const containerTop = container.getBoundingClientRect().top;
      const elTop = el.getBoundingClientRect().top;
      const offset = elTop - containerTop + container.scrollTop - 16;
      container.scrollTo({ top: offset, behavior: 'smooth' });
    }
  };

  const handleOpenIterate = () => {
    setIterateInput('');
    setIterateModel(aiConfig.model);
    setShowIterateModal(true);
  };

  const validateIterateModel = async (): Promise<AIConfig | null> => {
    const model = iterateModel.trim();
    if (!model) {
      message.warning('请输入本次迭代要使用的模型名称');
      return null;
    }

    const nextConfig: AIConfig = { ...aiConfig, model };
    setCheckingIterateModel(true);
    try {
      aiService.setConfig(nextConfig);
      const ok = await aiService.testConnection();
      if (!ok) {
        message.error('模型验证失败，请检查模型名称、Base URL 和 API Key');
        return null;
      }
      dispatch(setAIConfig(nextConfig));
      message.success(`模型 ${model} 可用`);
      return nextConfig;
    } catch (e) {
      message.error('模型验证失败：' + (e instanceof Error ? e.message : '未知错误'));
      return null;
    } finally {
      setCheckingIterateModel(false);
    }
  };

  const handleStartIterate = async () => {
    if (!iterateInput.trim()) {
      message.warning('请输入优化要求');
      return;
    }
    const nextConfig = await validateIterateModel();
    if (!nextConfig) return;

    setCompareAIConfig(nextConfig);
    setPendingRequirements(iterateInput);
    setShowIterateModal(false);
    setShowComparePage(true);
  };

  // 对比页面完成 → 将选中章节合并到新版本
  const handleIterateComplete = (newContent: Record<string, string>, selectedIds: Set<string>) => {
    // 基于当前版本内容，只替换选中的章节
    const mergedContent: Record<string, string> = { ...currentVersionData!.content };
    selectedIds.forEach((id) => {
      if (newContent[id]) mergedContent[id] = newContent[id];
    });

    const totalWords = Object.values(mergedContent).join('').length;
    const newVersion = currentVersion + 1;
    dispatch(addVersion({
      version: newVersion,
      content: mergedContent,
      requirements: pendingRequirements + (selectedIds.size < flatList.length
        ? `（已选择应用 ${selectedIds.size}/${flatList.length} 章）` : ''),
      createdAt: new Date().toISOString(),
      wordCount: totalWords,
    }));
    setShowComparePage(false);
    setCompareAIConfig(null);
    setPendingRequirements('');
    message.success(`✅ 版本 V${newVersion} 已创建，已应用 ${selectedIds.size} 个章节！`);
  };

  const handleIterateCancel = () => {
    setShowComparePage(false);
    setCompareAIConfig(null);
    setPendingRequirements('');
  };

  // 切换到历史版本
  const handleSwitchVersion = (v: number) => {
    dispatch(setCurrentVersion(v));
    message.success(`已切换到 V${v} 版本`);
  };

  // 导出指定版本
  const handleExportVersion = (v: number) => {
    dispatch(setCurrentVersion(v));
    dispatch(setStage('export'));
  };

  const canIterate = currentVersion < userPreferences.maxIterations;

  if (!currentVersionData) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spin size="large" tip="加载中..." />
      </div>
    );
  }

  // ── 迭代对比页面（全屏覆盖）──
  if (showComparePage && v1Data && currentVersionData) {
    return (
      <IterateComparePage
        outline={outline}
        v1Content={v1Data.content}
        projectTheme={projectInfo?.theme || ''}
        currentVersion={currentVersion}
        currentContent={currentVersionData.content}
        iterateRequirements={pendingRequirements}
        aiConfig={compareAIConfig ?? aiConfig}
        onComplete={handleIterateComplete}
        onCancel={handleIterateCancel}
      />
    );
  }

  // ── 主优化视图 ──
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* 左侧大纲导航 */}
      {!leftPanelCollapsed && (
        <div style={{
          width: 260,
          borderRight: '1px solid #e8e8e8',
          overflow: 'auto',
          background: '#fafafa',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            padding: '16px 16px 8px',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <Text strong style={{ fontSize: 13 }}>📋 大纲导航</Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Badge count={`V${currentVersion}`} style={{ background: '#667eea' }} />
              <Button
                size="small"
                type="text"
                icon={<MenuFoldOutlined />}
                onClick={() => dispatch(setLeftPanelCollapsed(true))}
              />
            </div>
          </div>
          <div style={{ flex: 1, overflow: 'auto', padding: '8px 8px' }}>
            <OutlineNav nodes={outline} activeId={activeSection} onSelect={handleNavSelect} />
          </div>
          <div style={{ padding: 12, borderTop: '1px solid #f0f0f0' }}>
            <Text style={{ fontSize: 11, color: '#aaa' }}>
              共 {currentVersionData.wordCount.toLocaleString()} 字
            </Text>
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* 顶部工具栏 */}
        <div style={{
          padding: '10px 20px',
          borderBottom: '1px solid #e8e8e8',
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {leftPanelCollapsed && (
              <Button
                size="small"
                type="text"
                icon={<MenuUnfoldOutlined />}
                onClick={() => dispatch(setLeftPanelCollapsed(false))}
              />
            )}
            <Text strong>{projectInfo?.theme}</Text>
            <Tag color="purple">版本 {currentVersion}</Tag>
            <Text type="secondary" style={{ fontSize: 12 }}>
              欢迎前往{' '}
              <Link href="https://www.aiping.cn/modelList" target="_blank" rel="noreferrer">
                模型列表
              </Link>
              {' '}自行选择想要使用的模型
            </Text>
            <Text style={{ color: '#888', fontSize: 12 }}>
              {currentVersionData.wordCount.toLocaleString()} 字
            </Text>
            {currentVersion > 1 && (
              <Tag color="blue" style={{ fontSize: 11 }}>
                基于 V{currentVersion - 1} 迭代
              </Tag>
            )}
          </div>
          <Space>
            {/* 查看历史版本 */}
            {versions.length > 0 && (
              <Button
                icon={<HistoryOutlined />}
                onClick={() => setShowHistory(true)}
                style={{ borderColor: '#667eea', color: '#667eea' }}
              >
                历史版本 ({versions.length})
              </Button>
            )}
            {canIterate && (
              <Tooltip title={`生成版本 V${currentVersion + 1}，可与 V1 对比查看`}>
                <Button
                  icon={<RocketOutlined />}
                  onClick={handleOpenIterate}
                  style={{ borderColor: '#764ba2', color: '#764ba2' }}
                >
                  迭代新版本 (V{currentVersion + 1})
                </Button>
              </Tooltip>
            )}
            <Button
              type="primary"
              icon={<ExportOutlined />}
              onClick={() => dispatch(setStage('export'))}
              style={{ background: 'linear-gradient(135deg, #11998e, #38ef7d)', border: 'none' }}
            >
              完成并导出
            </Button>
          </Space>
        </div>

        {/* 内容滚动区 */}
        <div
          ref={contentAreaRef}
          style={{ flex: 1, overflow: 'auto', padding: '24px 32px', background: '#f5f6fa' }}
        >
          {flatList.map((node) => (
            <SectionCard
              key={node.id}
              node={node}
              content={currentVersionData.content[node.id] || ''}
              theme={projectInfo?.theme || ''}
              outline={outline}
              onContentUpdate={handleContentUpdate}
            />
          ))}
        </div>
      </div>

      {/* 版本迭代需求输入 Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <RocketOutlined style={{ color: '#667eea' }} />
            <span>迭代新版本 — 生成 V{currentVersion + 1}</span>
          </div>
        }
        open={showIterateModal}
        onCancel={() => setShowIterateModal(false)}
        footer={null}
        width={560}
      >
        <div style={{ padding: '16px 0' }}>
          <Text style={{ color: '#666', display: 'block', marginBottom: 8 }}>
            请输入整体修改要求，AI 将对全文进行优化并生成新版本。
          </Text>
          <Text style={{ color: '#999', fontSize: 12, display: 'block', marginBottom: 16 }}>
            💡 生成完成后，您可以在左右对比视图中勾选要应用的章节，未勾选的章节将保留当前版本内容。
            （当前版本 V{currentVersion}，最多支持 {userPreferences.maxIterations} 个版本）
          </Text>
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>本次迭代模型</Text>
            <Space.Compact style={{ width: '100%' }}>
              <Input
                value={iterateModel}
                onChange={(e) => setIterateModel(e.target.value)}
                placeholder="例如：gpt-4o"
                disabled={checkingIterateModel}
              />
              <Button onClick={validateIterateModel} loading={checkingIterateModel}>
                验证模型
              </Button>
            </Space.Compact>
            <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12 }}>
              点击开始生成前会自动验证该模型是否可用，验证通过后会保存为当前模型配置。
            </Text>
          </div>
          <TextArea
            value={iterateInput}
            onChange={(e) => setIterateInput(e.target.value)}
            placeholder="例如：增加更多数据引用、调整语言风格更学术化、补充案例分析..."
            rows={5}
            style={{ marginBottom: 16 }}
            autoFocus
          />
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={() => setShowIterateModal(false)}>取消</Button>
            <Button
              type="primary"
              onClick={handleStartIterate}
              icon={<RightOutlined />}
              loading={checkingIterateModel}
              style={{ background: 'linear-gradient(135deg, #667eea, #764ba2)', border: 'none' }}
            >
              开始生成并对比
            </Button>
          </Space>
        </div>
      </Modal>

      {/* 历史版本抽屉 */}
      <HistoryDrawer
        open={showHistory}
        onClose={() => setShowHistory(false)}
        versions={versions}
        currentVersion={currentVersion}
        outline={outline}
        onSwitchVersion={handleSwitchVersion}
        onExportVersion={handleExportVersion}
      />
    </div>
  );
}
