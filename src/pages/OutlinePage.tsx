import { useState, useRef, useEffect } from 'react';
import {
  Button, Input, Card, Typography, Space, Tag, Tooltip, message
} from 'antd';
import {
  BulbOutlined, SendOutlined, CheckOutlined, ReloadOutlined, LoadingOutlined, StopOutlined
} from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../hooks/useAppDispatch';
import { setStage } from '../store/appSlice';
import { initProject, setOutline, addChatMessage } from '../store/projectSlice';
import { AI_REQUEST_TIMEOUT_LABEL, aiService } from '../services/aiService';
import type { OutlineNode, ChatMessage } from '../types';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

function OutlineTree({ nodes, level = 0 }: { nodes: OutlineNode[]; level?: number }) {
  const colors = ['#667eea', '#764ba2', '#f093fb'];
  return (
    <div>
      {nodes.map((node) => (
        <div key={node.id} style={{ marginLeft: level * 20, marginBottom: 6 }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 12px',
            borderRadius: 8,
            background: level === 0 ? '#f0f2ff' : level === 1 ? '#f9f0ff' : '#fff',
            borderLeft: `3px solid ${colors[Math.min(level, 2)]}`,
          }}>
            <Tag color={level === 0 ? 'blue' : level === 1 ? 'purple' : 'default'} style={{ fontSize: 11 }}>
              {level === 0 ? 'H1' : level === 1 ? 'H2' : 'H3'}
            </Tag>
            <Text strong={level === 0}>{node.title}</Text>
          </div>
          {node.children?.length > 0 && (
            <OutlineTree nodes={node.children} level={level + 1} />
          )}
        </div>
      ))}
    </div>
  );
}

export default function OutlinePage() {
  const dispatch = useAppDispatch();
  const aiConfig = useAppSelector((s) => s.app.aiConfig);
  const outline = useAppSelector((s) => s.project.outline);
  const chatMessages = useAppSelector((s) => s.project.chatMessages);
  const projectInfo = useAppSelector((s) => s.project.projectInfo);

  const [theme, setTheme] = useState('');
  const [requirements, setRequirements] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [stage, setLocalStage] = useState<'input' | 'outline'>(() => (
    outline.length > 0 ? 'outline' : 'input'
  ));

  // 流式生成状态
  const [streamingText, setStreamingText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const streamingRef = useRef('');
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const displayTheme = projectInfo?.theme || theme;

  // 取消控制器
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!projectInfo) return;
    setTheme((current) => current || projectInfo.theme);
    setRequirements((current) => current || projectInfo.requirements);
  }, [projectInfo]);

  // 自动滚动到底部
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, loading, streamingText]);

  // 取消当前生成
  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setStreamingText('');
    setLoading(false);
    message.info('已取消生成');
  };

  const handleGenerate = async () => {
    if (!theme.trim()) {
      message.warning('请输入报告主题');
      return;
    }
    setLoading(true);
    setIsStreaming(true);
    setStreamingText('');
    streamingRef.current = '';

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      aiService.setConfig(aiConfig);
      const nodes = await aiService.generateOutline(theme, requirements, (chunk) => {
        streamingRef.current += chunk;
        setStreamingText(streamingRef.current);
      }, controller.signal);

      setIsStreaming(false);
      setStreamingText('');

      const projectId = `proj_${Date.now()}`;
      dispatch(initProject({
        id: projectId,
        theme,
        requirements,
        createdAt: new Date().toISOString(),
      }));
      dispatch(setOutline(nodes));
      dispatch(addChatMessage({
        id: Date.now().toString(),
        role: 'assistant',
        content: `已根据主题"${theme}"生成大纲，共 ${nodes.length} 个一级章节。您可以在下方对话框中提出修改意见。`,
        timestamp: new Date().toISOString(),
      }));
      setLocalStage('outline');
    } catch (e) {
      setIsStreaming(false);
      setStreamingText('');
      if (e instanceof DOMException && e.name === 'AbortError') {
        // 用户取消，不显示错误
        return;
      }
      message.error('生成大纲失败：' + (e instanceof Error ? e.message : '未知错误'));
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleChat = async () => {
    if (!chatInput.trim()) return;
    if (outline.length === 0) {
      message.warning('当前没有可修改的大纲，请先生成大纲');
      return;
    }

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: chatInput,
      timestamp: new Date().toISOString(),
    };
    dispatch(addChatMessage(userMsg));
    const userInput = chatInput;
    setChatInput('');
    setLoading(true);
    setIsStreaming(true);
    setStreamingText('');
    streamingRef.current = '';

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 使用 Redux 中的 theme（projectInfo.theme），避免本地 state 为空的问题
    const currentTheme = projectInfo?.theme || theme;
    const currentOutline = outline;
    try {
      aiService.setConfig(aiConfig);
      const newOutline = await aiService.refineOutline(
        currentOutline,
        userInput,
        currentTheme,
        (chunk) => {
          streamingRef.current += chunk;
          setStreamingText(streamingRef.current);
        },
        controller.signal
      );
      setIsStreaming(false);
      setStreamingText('');

      // 防御性检查：确保返回的是有效的非空大纲
      if (!Array.isArray(newOutline) || newOutline.length === 0) {
        message.error('AI 返回了空大纲，已保留原大纲，请重试');
        dispatch(setOutline(currentOutline));
        return;
      }
      dispatch(setOutline(newOutline));
      dispatch(addChatMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `已根据您的要求更新大纲，共 ${newOutline.length} 个一级章节，请查看左侧预览。`,
        timestamp: new Date().toISOString(),
      }));
    } catch (e) {
      setIsStreaming(false);
      setStreamingText('');
      if (e instanceof DOMException && e.name === 'AbortError') {
        dispatch(addChatMessage({
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '已取消本次修改，大纲保持不变。',
          timestamp: new Date().toISOString(),
        }));
        return;
      }
      dispatch(setOutline(currentOutline));
      message.error('修改失败：' + (e instanceof Error ? e.message : '未知错误'));
      dispatch(addChatMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `修改失败，已保留原大纲。${e instanceof Error ? e.message : '请稍后重试。'}`,
        timestamp: new Date().toISOString(),
      }));
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleConfirm = () => {
    if (outline.length === 0) {
      message.warning('请先生成大纲');
      return;
    }
    dispatch(setStage('draft'));
  };

  // ========== 输入阶段 ==========
  if (stage === 'input') {
    return (
      <div style={{
        minHeight: 'calc(100vh - 56px)',
        background: '#f5f6fa',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
      }}>
        <Card
          style={{ width: '100%', maxWidth: 640, borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.1)' }}
          styles={{ body: { padding: 40 } }}
        >
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 56, height: 56,
              background: 'linear-gradient(135deg, #667eea, #764ba2)',
              borderRadius: 14,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 12,
            }}>
              <BulbOutlined style={{ fontSize: 28, color: '#fff' }} />
            </div>
            <Title level={3} style={{ margin: 0 }}>生成报告大纲</Title>
            <Paragraph style={{ color: '#888', marginTop: 8 }}>
              输入报告主题和要求，AI 将自动生成结构化大纲
            </Paragraph>
          </div>

          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <div>
              <Text strong>报告主题 *</Text>
              <Input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="例如：2025年人工智能行业研究报告"
                size="large"
                style={{ marginTop: 8 }}
                onPressEnter={!isStreaming ? handleGenerate : undefined}
                disabled={isStreaming}
              />
            </div>
            <div>
              <Text strong>具体要求</Text>
              <TextArea
                value={requirements}
                onChange={(e) => setRequirements(e.target.value)}
                placeholder="例如：包含行业现状、技术趋势、市场分析、政策环境、未来展望"
                rows={4}
                style={{ marginTop: 8 }}
                disabled={isStreaming}
              />
            </div>

            {/* 流式生成预览区 */}
            {isStreaming && (
              <div style={{
                background: '#f8f9ff',
                border: '1px solid #d0d7ff',
                borderRadius: 10,
                padding: 16,
                maxHeight: 260,
                overflow: 'auto',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <LoadingOutlined style={{ color: '#667eea' }} />
                  <Text style={{ color: '#667eea', fontSize: 13, fontWeight: 600 }}>AI 正在生成大纲...</Text>
                </div>
                <pre style={{
                  margin: 0,
                  fontSize: 12,
                  color: '#444',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-all',
                  fontFamily: 'monospace',
                  lineHeight: 1.6,
                }}>
                  {streamingText}
                  <span style={{
                    display: 'inline-block',
                    width: 2,
                    height: '1em',
                    background: '#667eea',
                    marginLeft: 2,
                    verticalAlign: 'text-bottom',
                    animation: 'blink 1s step-end infinite',
                  }} />
                </pre>
              </div>
            )}

            {isStreaming ? (
              <Button
                danger
                size="large"
                block
                icon={<StopOutlined />}
                onClick={handleCancel}
                style={{ height: 48, fontSize: 16 }}
              >
                取消生成
              </Button>
            ) : (
              <Button
                type="primary"
                size="large"
                block
                loading={loading && !isStreaming}
                onClick={handleGenerate}
                style={{
                  background: 'linear-gradient(135deg, #667eea, #764ba2)',
                  border: 'none',
                  height: 48,
                  fontSize: 16,
                }}
              >
                {loading ? '处理中...' : '生成大纲 →'}
              </Button>
            )}
            <Text type="secondary" style={{ fontSize: 12, textAlign: 'center', display: 'block' }}>
              AI 请求超时时间：{AI_REQUEST_TIMEOUT_LABEL}
            </Text>
          </Space>
        </Card>

        {/* 光标闪烁动画 */}
        <style>{`
          @keyframes blink {
            0%, 100% { opacity: 1; }
            50% { opacity: 0; }
          }
        `}</style>
      </div>
    );
  }

  // ========== 大纲预览 + 对话阶段 ==========
  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
      {/* 左侧大纲预览 */}
      <div style={{
        width: 320,
        borderRight: '1px solid #e8e8e8',
        overflow: 'auto',
        padding: 20,
        background: '#fafafa',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <Text strong style={{ fontSize: 15 }}>大纲预览</Text>
          <Tooltip title="重新生成">
            <Button size="small" icon={<ReloadOutlined />} onClick={() => setLocalStage('input')} />
          </Tooltip>
        </div>
        {outline.length > 0 ? (
          <OutlineTree nodes={outline} />
        ) : (
          <div style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#aaa' }}>暂无大纲</Text>
          </div>
        )}
        <Text type="secondary" style={{ display: 'block', marginTop: 12, fontSize: 12, lineHeight: 1.6 }}>
          AI 请求最长等待 {AI_REQUEST_TIMEOUT_LABEL}，修改失败时会保留当前大纲。
        </Text>
      </div>

      {/* 右侧对话区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 24px', borderBottom: '1px solid #e8e8e8', background: '#fff' }}>
          <Text strong style={{ fontSize: 16 }}>📝 {displayTheme}</Text>
          <Text style={{ color: '#888', marginLeft: 12 }}>大纲生成阶段 — 可通过对话修改大纲</Text>
        </div>

        {/* 对话消息 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24, background: '#f5f6fa' }}>
          {chatMessages.map((msg) => (
            <div key={msg.id} style={{
              display: 'flex',
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              marginBottom: 16,
            }}>
              <div style={{
                maxWidth: '70%',
                padding: '10px 16px',
                borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                background: msg.role === 'user' ? 'linear-gradient(135deg, #667eea, #764ba2)' : '#fff',
                color: msg.role === 'user' ? '#fff' : '#333',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              }}>
                {msg.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 16 }}>
              <div style={{ padding: '10px 16px', borderRadius: 16, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
                <LoadingOutlined style={{ color: '#667eea' }} />
                <span style={{ marginLeft: 8, color: '#888' }}>AI 正在思考...</span>
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* 输入区 */}
        <div style={{ padding: 16, background: '#fff', borderTop: '1px solid #e8e8e8' }}>
          {loading ? (
            <Button
              danger
              block
              size="large"
              icon={<StopOutlined />}
              onClick={handleCancel}
              style={{ marginBottom: 12, height: 44 }}
            >
              取消修改
            </Button>
          ) : (
            <Space.Compact style={{ width: '100%', marginBottom: 12 }}>
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="输入修改意见，例如：增加第二章关于市场规模..."
                onPressEnter={handleChat}
                size="large"
                disabled={loading}
              />
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={handleChat}
                loading={loading}
                size="large"
                style={{ background: '#667eea', border: 'none' }}
              >
                发送
              </Button>
            </Space.Compact>
          )}
          <Button
            type="primary"
            icon={<CheckOutlined />}
            onClick={handleConfirm}
            block
            size="large"
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, #11998e, #38ef7d)',
              border: 'none',
              height: 44,
            }}
          >
            确认大纲，进入初稿生成 →
          </Button>
          <Text type="secondary" style={{ display: 'block', marginTop: 8, fontSize: 12, textAlign: 'center' }}>
            对话修改最多等待 {AI_REQUEST_TIMEOUT_LABEL}。
          </Text>
        </div>
      </div>
    </div>
  );
}
