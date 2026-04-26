import { useSelector } from 'react-redux';
import { ConfigProvider, Layout, Steps, theme } from 'antd';
import {
  SettingOutlined, BulbOutlined, FileTextOutlined,
  EditOutlined, ExportOutlined
} from '@ant-design/icons';
import type { RootState } from './store';
import type { AppStage } from './types';
import ConfigPage from './pages/ConfigPage';
import OutlinePage from './pages/OutlinePage';
import DraftPage from './pages/DraftPage';
import OptimizePage from './pages/OptimizePage';
import ExportPage from './pages/ExportPage';
import 'antd/dist/reset.css';

const { Header, Content } = Layout;

const STAGES: AppStage[] = ['config', 'outline', 'draft', 'optimize', 'export'];

const STEP_ITEMS = [
  { title: '配置', icon: <SettingOutlined /> },
  { title: '大纲', icon: <BulbOutlined /> },
  { title: '初稿', icon: <FileTextOutlined /> },
  { title: '优化', icon: <EditOutlined /> },
  { title: '导出', icon: <ExportOutlined /> },
];

function StageContent({ stage }: { stage: AppStage }) {
  switch (stage) {
    case 'config': return <ConfigPage />;
    case 'outline': return <OutlinePage />;
    case 'draft': return <DraftPage />;
    case 'optimize': return <OptimizePage />;
    case 'export': return <ExportPage />;
    default: return <ConfigPage />;
  }
}

export default function App() {
  const stage = useSelector((s: RootState) => s.app.stage);
  const currentStep = STAGES.indexOf(stage);

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          colorPrimary: '#667eea',
          borderRadius: 8,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
        },
      }}
    >
      <Layout style={{ minHeight: '100vh', background: '#f5f6fa' }}>
        {/* 顶部导航栏（始终固定显示） */}
        <Header style={{
            background: '#fff',
            borderBottom: '1px solid #e8e8e8',
            padding: '0 32px',
            height: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}>
            {/* Logo */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 160 }}>
              <div style={{
                width: 28, height: 28,
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                borderRadius: 7,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FileTextOutlined style={{ color: '#fff', fontSize: 14 }} />
              </div>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a2e' }}>AI 报告生成器</span>
            </div>

            {/* 步骤条 */}
            <Steps
              current={currentStep}
              items={STEP_ITEMS}
              size="small"
              style={{ flex: 1, maxWidth: 600, margin: '0 32px' }}
            />

            <div style={{ minWidth: 160 }} />
          </Header>

        <Content style={{ flex: 1, overflow: 'hidden' }}>
          <StageContent stage={stage} />
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
