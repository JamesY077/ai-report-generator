import { useState, useRef } from 'react';
import {
  Button, InputNumber, Typography, Progress, Space, Card, message, Slider
} from 'antd';
import { FileTextOutlined, ThunderboltOutlined, LoadingOutlined, StopOutlined } from '@ant-design/icons';
import ReactMarkdown from 'react-markdown';
import { useAppDispatch, useAppSelector } from '../hooks/useAppDispatch';
import { setStage, setGenerationProgress } from '../store/appSlice';
import { addVersion, setWordCountTarget } from '../store/projectSlice';
import { aiService } from '../services/aiService';
import { flattenOutline } from '../services/aiService';

const { Title, Text, Paragraph } = Typography;

export default function DraftPage() {
  const dispatch = useAppDispatch();
  const aiConfig = useAppSelector((s) => s.app.aiConfig);
  const outline = useAppSelector((s) => s.project.outline);
  const projectInfo = useAppSelector((s) => s.project.projectInfo);
  const wordCountTarget = useAppSelector((s) => s.project.wordCountTarget);
  const generationProgress = useAppSelector((s) => s.app.generationProgress);

  const [wordCount, setWordCount] = useState(wordCountTarget);
  const [generating, setGenerating] = useState(false);
  // 当前章节实时流式内容
  const [currentSectionContent, setCurrentSectionContent] = useState('');
  const contentRef = useRef<Record<string, string>>({});

  // 取消控制器
  const abortControllerRef = useRef<AbortController | null>(null);

  const flatList = flattenOutline(outline);

  const handleCancel = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setGenerating(false);
    setCurrentSectionContent('');
    dispatch(setGenerationProgress({ isGenerating: false, currentSection: '已取消' }));
    message.info('已取消生成');
  };

  const handleGenerate = async () => {
    if (!projectInfo) return;
    setGenerating(true);
    dispatch(setWordCountTarget(wordCount));
    contentRef.current = {};
    setCurrentSectionContent('');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    dispatch(setGenerationProgress({
      total: flatList.length,
      completed: 0,
      currentSection: '',
      isGenerating: true,
    }));

    try {
      aiService.setConfig(aiConfig);

      for (let i = 0; i < flatList.length; i++) {
        // 每章节前检查取消
        if (controller.signal.aborted) break;

        const section = flatList[i];
        dispatch(setGenerationProgress({
          completed: i,
          currentSection: section.title,
        }));
        setCurrentSectionContent('');

        let sectionContent = '';
        await aiService.generateSectionContent(
          section.title,
          projectInfo.theme,
          outline,
          wordCount,
          (chunk) => {
            sectionContent += chunk;
            setCurrentSectionContent(sectionContent);
          },
          controller.signal
        );
        contentRef.current[section.id] = sectionContent;
      }

      // 如果被取消，不保存版本
      if (controller.signal.aborted) {
        return;
      }

      dispatch(setGenerationProgress({
        completed: flatList.length,
        currentSection: '生成完成',
        isGenerating: false,
      }));

      const totalWords = Object.values(contentRef.current).join('').length;
      dispatch(addVersion({
        version: 1,
        content: { ...contentRef.current },
        requirements: projectInfo.requirements,
        createdAt: new Date().toISOString(),
        wordCount: totalWords,
      }));

      message.success(`✅ 初稿生成完成！共 ${totalWords} 字`);
      dispatch(setStage('optimize'));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        // 用户取消，不显示错误
        dispatch(setGenerationProgress({ isGenerating: false, currentSection: '已取消' }));
        return;
      }
      message.error('生成失败：' + (e instanceof Error ? e.message : '未知错误'));
      dispatch(setGenerationProgress({ isGenerating: false }));
    } finally {
      setGenerating(false);
      setCurrentSectionContent('');
      abortControllerRef.current = null;
    }
  };

  const progressPercent = generationProgress.total > 0
    ? Math.round((generationProgress.completed / generationProgress.total) * 100)
    : 0;

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)',
      background: '#f5f6fa',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '40px 40px',
    }}>
      <div style={{ width: '100%', maxWidth: 860 }}>
        {/* 标题卡片 */}
        <Card
          style={{ borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.1)', marginBottom: 24 }}
          styles={{ body: { padding: 40 } }}
        >
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <div style={{
              width: 56, height: 56,
              background: 'linear-gradient(135deg, #f093fb, #f5576c)',
              borderRadius: 14,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 12,
            }}>
              <FileTextOutlined style={{ fontSize: 28, color: '#fff' }} />
            </div>
            <Title level={3} style={{ margin: 0 }}>生成初稿</Title>
            <Paragraph style={{ color: '#888', marginTop: 8 }}>
              AI 将根据大纲逐章节生成完整内容
            </Paragraph>
          </div>

          {/* 大纲预览 */}
          <Card
            size="small"
            style={{ marginBottom: 24, background: '#f9f0ff', border: '1px solid #d3adf7' }}
            title={<Text strong>📋 已确认大纲（{flatList.length} 个章节）</Text>}
          >
            <div style={{ maxHeight: 200, overflow: 'auto' }}>
              {flatList.map((node) => (
                <div key={node.id} style={{
                  padding: '4px 0',
                  paddingLeft: node.level === 1 ? 0 : node.level === 2 ? 20 : 40,
                  color: node.level === 1 ? '#222' : node.level === 2 ? '#555' : '#888',
                  fontWeight: node.level === 1 ? 700 : node.level === 2 ? 500 : 400,
                  fontSize: node.level === 1 ? 14 : node.level === 2 ? 13 : 12,
                  borderLeft: node.level > 1 ? `2px solid ${node.level === 2 ? '#d3adf7' : '#e8d5ff'}` : 'none',
                  marginLeft: node.level === 1 ? 0 : node.level === 2 ? 16 : 32,
                }}>
                  {node.level === 1 ? '▶ ' : node.level === 2 ? '• ' : '◦ '}{node.title}
                </div>
              ))}
            </div>
          </Card>

          {/* 字数设置 */}
          <div style={{ marginBottom: 24 }}>
            <Text strong>全文字数目标</Text>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
              <Slider
                min={3000}
                max={80000}
                step={1000}
                value={wordCount}
                onChange={(v) => setWordCount(v)}
                style={{ flex: 1 }}
                disabled={generating}
                marks={{
                  5000: '5k',
                  15000: '15k',
                  30000: '30k',
                  50000: '50k',
                }}
              />
              <InputNumber
                min={3000}
                max={100000}
                step={1000}
                value={wordCount}
                onChange={(v) => setWordCount(v ?? 15000)}
                addonAfter="字"
                style={{ width: 140 }}
                disabled={generating}
              />
            </div>
            <Text style={{ color: '#888', fontSize: 12 }}>
              预计每章节约 {Math.floor(wordCount / Math.max(flatList.length, 1))} 字
            </Text>
          </div>

          {/* 生成进度 */}
          {generating && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <Space>
                  <LoadingOutlined style={{ color: '#667eea' }} />
                  <Text>正在生成：<Text strong>{generationProgress.currentSection}</Text></Text>
                </Space>
                <Text style={{ color: '#888' }}>{generationProgress.completed}/{generationProgress.total}</Text>
              </div>
              <Progress
                percent={progressPercent}
                strokeColor={{ '0%': '#667eea', '100%': '#764ba2' }}
                status="active"
              />
            </div>
          )}

          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            {generating ? (
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
                onClick={handleGenerate}
                icon={<ThunderboltOutlined />}
                style={{
                  background: 'linear-gradient(135deg, #f093fb, #f5576c)',
                  border: 'none',
                  height: 48,
                  fontSize: 16,
                }}
              >
                开始生成初稿
              </Button>
            )}
            <Button
              size="large"
              block
              onClick={() => dispatch(setStage('outline'))}
              disabled={generating}
            >
              ← 返回修改大纲
            </Button>
          </Space>
        </Card>

        {/* 实时内容预览区 */}
        {generating && currentSectionContent && (
          <Card
            style={{ borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
            title={
              <Space>
                <LoadingOutlined style={{ color: '#f5576c' }} />
                <Text strong style={{ color: '#f5576c' }}>
                  正在生成：{generationProgress.currentSection}
                </Text>
              </Space>
            }
          >
            <div style={{
              maxHeight: 400,
              overflow: 'auto',
              lineHeight: 1.8,
              fontSize: 14,
              color: '#333',
            }}>
              <ReactMarkdown>{currentSectionContent}</ReactMarkdown>
              {/* 光标 */}
              <span style={{
                display: 'inline-block',
                width: 2,
                height: '1em',
                background: '#f5576c',
                marginLeft: 2,
                verticalAlign: 'text-bottom',
                animation: 'blink 1s step-end infinite',
              }} />
            </div>
          </Card>
        )}
      </div>

      <style>{`
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
