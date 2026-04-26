import { useState } from 'react';
import { Form, Input, Button, Card, message, Typography, Space, Divider, InputNumber } from 'antd';
import { ApiOutlined, CheckCircleOutlined, SettingOutlined } from '@ant-design/icons';
import { useAppDispatch, useAppSelector } from '../hooks/useAppDispatch';
import { setAIConfig, setConnected, setStage, setUserPreferences } from '../store/appSlice';
import { aiService } from '../services/aiService';
import type { AIConfig } from '../types';

const { Title, Paragraph } = Typography;

export default function ConfigPage() {
  const dispatch = useAppDispatch();
  const aiConfig = useAppSelector((s) => s.app.aiConfig);
  const userPreferences = useAppSelector((s) => s.app.userPreferences);
  const [testing, setTesting] = useState(false);
  const [form] = Form.useForm();

  const handleTest = async () => {
    try {
      const values = await form.validateFields(['baseUrl', 'apiKey', 'model']);
      setTesting(true);
      const config: AIConfig = values as AIConfig;
      aiService.setConfig(config);
      const ok = await aiService.testConnection();
      if (ok) {
        dispatch(setConnected(true));
        message.success('✅ 连接成功！AI 模型已就绪');
      } else {
        dispatch(setConnected(false));
        message.error('❌ 连接失败，请检查 Base URL 和 API Key');
      }
    } catch {
      message.error('请先填写完整配置');
    } finally {
      setTesting(false);
    }
  };

  const handleStart = async () => {
    try {
      const values = await form.validateFields();
      const config: AIConfig = {
        baseUrl: values.baseUrl as string,
        apiKey: values.apiKey as string,
        model: values.model as string,
      };
      dispatch(setAIConfig(config));
      dispatch(setUserPreferences({
        defaultWordCount: values.defaultWordCount as number,
        maxIterations: values.maxIterations as number,
      }));
      aiService.setConfig(config);
      dispatch(setStage('outline'));
    } catch {
      message.error('请填写完整配置信息');
    }
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 56px)',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 20px',
    }}>
      <Card
        style={{
          width: '100%',
          maxWidth: 560,
          borderRadius: 16,
          boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        }}
        styles={{ body: { padding: '40px' } }}
      >
        {/* Logo & 标题 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 64,
            height: 64,
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            borderRadius: 16,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}>
            <SettingOutlined style={{ fontSize: 32, color: '#fff' }} />
          </div>
          <Title level={2} style={{ margin: 0, color: '#1a1a2e' }}>AI 报告生成器</Title>
          <Paragraph style={{ color: '#666', marginTop: 8 }}>
            基于大语言模型的智能报告撰写工具
          </Paragraph>
        </div>

        <Form
          form={form}
          layout="vertical"
          initialValues={{
            baseUrl: aiConfig.baseUrl,
            apiKey: aiConfig.apiKey,
            model: aiConfig.model,
            defaultWordCount: userPreferences.defaultWordCount,
            maxIterations: userPreferences.maxIterations,
          }}
        >
          <Divider>
            <Space>
              <ApiOutlined />
              <span style={{ fontWeight: 600 }}>AI 模型配置</span>
            </Space>
          </Divider>

          <Form.Item
            label="Base URL"
            name="baseUrl"
            rules={[{ required: true, message: '请输入 Base URL' }]}
          >
            <Input placeholder="https://api.openai.com/v1" size="large" />
          </Form.Item>

          <Form.Item
            label="API Key"
            name="apiKey"
            rules={[{ required: true, message: '请输入 API Key' }]}
          >
            <Input.Password placeholder="sk-xxxxxxxxxxxxxxxx" size="large" />
          </Form.Item>

          <Form.Item
            label="模型名称"
            name="model"
            rules={[{ required: true, message: '请输入模型名称' }]}
          >
            <Input placeholder="gpt-4o" size="large" />
          </Form.Item>

          <Divider>
            <Space>
              <SettingOutlined />
              <span style={{ fontWeight: 600 }}>偏好设置</span>
            </Space>
          </Divider>

          <Form.Item label="默认全文字数" name="defaultWordCount">
            <InputNumber
              min={3000}
              max={100000}
              step={1000}
              style={{ width: '100%' }}
              size="large"
              addonAfter="字"
            />
          </Form.Item>

          <Form.Item label="最大迭代版本数" name="maxIterations">
            <InputNumber
              min={1}
              max={5}
              style={{ width: '100%' }}
              size="large"
              addonAfter="版"
            />
          </Form.Item>

          <Space style={{ width: '100%', marginTop: 8 }} direction="vertical" size={12}>
            <Button
              icon={<CheckCircleOutlined />}
              onClick={handleTest}
              loading={testing}
              block
              size="large"
            >
              测试连接
            </Button>
            <Button
              type="primary"
              onClick={handleStart}
              block
              size="large"
              style={{
                background: 'linear-gradient(135deg, #667eea, #764ba2)',
                border: 'none',
                height: 48,
                fontSize: 16,
              }}
            >
              开始创作报告 →
            </Button>
          </Space>
        </Form>
      </Card>
    </div>
  );
}
