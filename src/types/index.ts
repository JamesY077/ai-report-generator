// ==================== 大纲节点类型 ====================
export interface OutlineNode {
  id: string;
  title: string;
  level: number; // 1=一级标题, 2=二级标题, 3=三级标题
  parentId: string | null;
  children: OutlineNode[];
}

// ==================== 版本类型 ====================
export interface Version {
  version: number;
  content: Record<string, string>; // sectionId -> 内容
  requirements: string;
  createdAt: string;
  wordCount: number;
}

// ==================== 项目信息 ====================
export interface ProjectInfo {
  id: string;
  theme: string;
  requirements: string;
  createdAt: string;
}

// ==================== 完整项目数据 ====================
export interface ProjectData {
  projectInfo: ProjectInfo;
  outline: {
    structure: OutlineNode[];
  };
  versions: Version[];
  currentVersion: number;
}

// ==================== AI 配置 ====================
export interface AIConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

// ==================== 用户偏好 ====================
export interface UserPreferences {
  defaultWordCount: number;
  maxIterations: number;
}

// ==================== 应用配置 ====================
export interface AppConfig {
  aiConfig: AIConfig;
  userPreferences: UserPreferences;
}

// ==================== 应用阶段 ====================
export type AppStage =
  | 'config'       // 阶段一：初始化配置
  | 'outline'      // 阶段二：大纲生成
  | 'draft'        // 阶段三：初稿生成
  | 'optimize'     // 阶段四：内容优化
  | 'iterate'      // 阶段五：版本迭代
  | 'export';      // 阶段六：最终导出

// ==================== 对话消息 ====================
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

// ==================== 生成状态 ====================
export interface GenerationProgress {
  total: number;
  completed: number;
  currentSection: string;
  isGenerating: boolean;
}
