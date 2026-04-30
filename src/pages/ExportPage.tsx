import { useState } from 'react';
import {
  Button, Card, Typography, Space, Select, Tag, Descriptions, message, List
} from 'antd';
import {
  DownloadOutlined, FileWordOutlined, HistoryOutlined, ArrowLeftOutlined, LinkOutlined
} from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../hooks/useAppDispatch';
import type { Version } from '../types';
import { setStage } from '../store/appSlice';
import { exportToDocx } from '../utils/exportDocx';

const { Title, Text, Paragraph, Link } = Typography;

const FRIENDLY_LINKS = [
  { name: '中国知网', url: 'https://www.cnki.net' },
  { name: 'Paperpass', url: 'https://www.paperpass.com/?utm_source=baidufengchao&utm_medium=2026bdt-chachong&utm_term=chachong' },
  { name: '维普查重', url: 'https://www.weipuchachong.cn/wpfd/' },
];

export default function ExportPage() {
  const dispatch = useAppDispatch();
  const outline = useAppSelector((s) => s.project.outline);
  const versions = useAppSelector((s) => s.project.versions);
  const currentVersion = useAppSelector((s) => s.project.currentVersion);
  const projectInfo = useAppSelector((s) => s.project.projectInfo);

  const [selectedVersion, setSelectedVersion] = useState(currentVersion);
  const [exporting, setExporting] = useState(false);

  const selectedVersionData = versions.find((v) => v.version === selectedVersion);

  const handleExport = async () => {
    if (!selectedVersionData || !projectInfo) {
      message.error('未找到版本数据');
      return;
    }
    setExporting(true);
    try {
      // 导出前重新计算实际字数，确保准确
      const actualWordCount = Object.values(selectedVersionData.content).join('').length;
      const versionToExport = {
        ...selectedVersionData,
        wordCount: actualWordCount,
      };
      await exportToDocx(projectInfo.theme, outline, versionToExport, selectedVersion);
      message.success(`✅ 已导出版本 ${selectedVersion} 的 Word 文档（共 ${actualWordCount.toLocaleString()} 字）`);
    } catch (e) {
      message.error('导出失败：' + (e instanceof Error ? e.message : '未知错误'));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)',
      background: '#f5f6fa',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 40,
    }}>
      <div style={{ width: '100%', maxWidth: 720 }}>
        {/* 标题 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64, height: 64,
            background: 'linear-gradient(135deg, #11998e, #38ef7d)',
            borderRadius: 16,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            marginBottom: 16,
          }}>
            <FileWordOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <Title level={2} style={{ margin: 0 }}>导出报告</Title>
          <Paragraph style={{ color: '#888', marginTop: 8 }}>
            选择版本并导出为 Word 文档（.docx）
          </Paragraph>
        </div>

        {/* 项目信息 */}
        <Card style={{ borderRadius: 12, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <Descriptions title="项目信息" column={2} size="small">
            <Descriptions.Item label="报告主题">
              <Text strong>{projectInfo?.theme}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="当前版本">
              <Tag color="purple">V{currentVersion}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="总版本数">
              {versions.length} 个版本
            </Descriptions.Item>
            <Descriptions.Item label="创建时间">
              {projectInfo?.createdAt
                ? new Date(projectInfo.createdAt).toLocaleString('zh-CN')
                : '-'}
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* 版本历史 */}
        <Card
          title={
            <Space>
              <HistoryOutlined />
              <span>版本历史</span>
            </Space>
          }
          style={{ borderRadius: 12, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}
        >
          <List
            dataSource={versions}
            renderItem={(v: Version) => (
              <List.Item
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  marginBottom: 8,
                  background: selectedVersion === v.version ? '#f0f2ff' : '#fafafa',
                  border: selectedVersion === v.version ? '1px solid #667eea' : '1px solid #f0f0f0',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedVersion(v.version)}
                actions={[
                  <Tag key="words" color="blue">{v.wordCount.toLocaleString()} 字</Tag>,
                  <Tag key="date" color="default">
                    {new Date(v.createdAt).toLocaleDateString('zh-CN')}
                  </Tag>,
                ]}
              >
                <List.Item.Meta
                  avatar={
                    <div style={{
                      width: 36, height: 36,
                      background: selectedVersion === v.version
                        ? 'linear-gradient(135deg, #667eea, #764ba2)'
                        : '#e8e8e8',
                      borderRadius: 8,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: selectedVersion === v.version ? '#fff' : '#888',
                      fontWeight: 700,
                      fontSize: 14,
                    }}>
                      V{v.version}
                    </div>
                  }
                  title={<Text strong>版本 {v.version}</Text>}
                  description={
                    <Text style={{ fontSize: 12, color: '#888' }}>
                      {v.requirements || '初始版本'}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        </Card>

        {/* 导出操作 */}
        <Card style={{ borderRadius: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>选择导出版本</Text>
            <Select
              value={selectedVersion}
              onChange={setSelectedVersion}
              style={{ width: '100%' }}
              size="large"
              options={versions.map((v: Version) => ({
                value: v.version,
                label: `版本 ${v.version} — ${v.wordCount.toLocaleString()} 字 (${new Date(v.createdAt).toLocaleDateString('zh-CN')})`,
              }))}
            />
          </div>

          {selectedVersionData && (
            <div style={{
              padding: '12px 16px',
              background: '#f0fff4',
              borderRadius: 8,
              border: '1px solid #b7eb8f',
              marginBottom: 16,
            }}>
              <Text style={{ fontSize: 13 }}>
                📄 将导出：<Text strong>{projectInfo?.theme}</Text>
                {' '}— 版本 {selectedVersion}，共 {selectedVersionData.wordCount.toLocaleString()} 字
              </Text>
            </div>
          )}

          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <Button
              type="primary"
              size="large"
              block
              loading={exporting}
              onClick={handleExport}
              icon={<DownloadOutlined />}
              style={{
                background: 'linear-gradient(135deg, #11998e, #38ef7d)',
                border: 'none',
                height: 48,
                fontSize: 16,
              }}
            >
              {exporting ? '正在生成文档...' : '导出 Word 文档 (.docx)'}
            </Button>
            <Button
              size="large"
              block
              icon={<ArrowLeftOutlined />}
              onClick={() => dispatch(setStage('optimize'))}
            >
              返回继续编辑
            </Button>
          </Space>

          <div style={{
            marginTop: 20,
            paddingTop: 16,
            borderTop: '1px solid #f0f0f0',
          }}>
            <Text strong style={{ display: 'block', marginBottom: 10 }}>友情链接</Text>
            <Space wrap size={[16, 8]}>
              {FRIENDLY_LINKS.map((item) => (
                <Link
                  key={item.name}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <LinkOutlined />
                  {item.name}
                </Link>
              ))}
            </Space>
          </div>
        </Card>
      </div>
    </div>
  );
}
