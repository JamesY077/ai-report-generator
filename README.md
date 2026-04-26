# AI 报告生成器

一款基于大模型的报告生成工作台。它把“配置模型、生成大纲、对话修改、生成初稿、章节优化、版本迭代、导出 Word”串成了一条完整流程，适合用于研究报告、行业分析、方案文档、调研材料等长文档的快速起草与打磨。

项目使用 React + TypeScript + Ant Design 构建前端界面，接入兼容 OpenAI Chat Completions API 的大模型服务，支持流式生成和对话式修改。

## 功能亮点

- 完整报告生成流程：从主题输入到 Word 导出，覆盖报告生产的主要环节。
- 对话式大纲修改：生成大纲后，可以用自然语言继续调整结构。
- 流式生成体验：大纲和正文生成时实时展示模型输出。
- 稳定的大纲保护机制：修改失败时保留原大纲，避免内容被空结果覆盖。
- 多版本内容迭代：支持全文优化并生成新版本，方便比较和回退。
- 章节级优化：可单独刷新或根据建议优化某个章节。
- Word 文档导出：将指定版本导出为 `.docx` 文件。
- 兼容 OpenAI 风格接口：可接入 OpenAI 或其他兼容 Chat Completions 的服务。

## 产品流程

```text
AI 配置
  -> 大纲生成
  -> 对话修改大纲
  -> 初稿生成
  -> 章节优化 / 全文迭代
  -> Word 导出
```

## 技术栈

| 类型 | 技术 |
| --- | --- |
| 前端框架 | React 19, TypeScript |
| 构建工具 | Vite 8 |
| UI 组件 | Ant Design 6, @ant-design/icons |
| 状态管理 | Redux Toolkit, React Redux |
| AI 请求 | OpenAI Chat Completions compatible API |
| 流式处理 | Fetch ReadableStream, SSE |
| HTTP 客户端 | Axios |
| Markdown 渲染 | react-markdown |
| Word 导出 | docx, file-saver |
| 代码检查 | ESLint, TypeScript |

## 核心能力

### 1. AI 服务配置

- 支持配置 `Base URL`
- 支持配置 `API Key`
- 支持配置模型名称
- 支持连接测试
- 配置信息保存到浏览器 `localStorage`

### 2. 大纲生成与修改

- 根据报告主题和具体要求生成 1-3 级大纲
- 左侧实时预览大纲树
- 右侧通过聊天输入修改要求
- AI 请求超时时间为 5 分钟
- 对模型返回结果进行容错解析
- 修改失败时自动保留当前大纲

### 3. 初稿生成

- 根据确认后的大纲逐章节生成正文
- 支持设置目标总字数
- 自动估算每章节字数
- 生成完成后保存为版本 1
- 生成进度实时展示

### 4. 内容优化

- 左侧大纲导航
- 单章节刷新
- 单章节建议优化
- 全文整体迭代优化
- 新版本自动保存
- 版本字数统计

### 5. Word 导出

- 支持选择指定版本
- 导出 `.docx` 文档
- 包含报告标题、版本信息、字数统计和正文内容
- 支持基础 Markdown 样式转换

## 快速开始

### 环境要求

- Node.js 22 LTS 或更高版本
- npm，安装 Node.js 时会一起安装
- 一个兼容 OpenAI Chat Completions API 的模型服务

确认环境：

```bash
node -v
npm -v
```

如果命令不存在，请先安装 Node.js：

```text
https://nodejs.org/
```

### 一键启动

下载项目后，可以直接使用根目录下的启动脚本：

| 操作系统 | 启动方式 |
| --- | --- |
| macOS | 双击 `start-macos.command` |
| Windows | 双击 `start-windows.bat` |

启动脚本会自动完成：

- 检查 Node.js 和 npm 是否已安装
- 如果没有 `node_modules`，自动安装项目依赖
- 启动 Vite 开发服务
- 自动打开浏览器

macOS 如果提示没有执行权限，可以在终端进入项目目录后执行：

```bash
chmod +x start-macos.command
./start-macos.command
```

Windows 如果双击后被安全软件拦截，可以右键 `start-windows.bat`，选择允许运行。

### 手动启动

#### 安装依赖

```bash
npm install
```

#### 启动开发服务

```bash
npm run dev
```

启动后打开终端输出中的本地地址，通常是：

```text
http://localhost:5173/
```

如果端口被占用，Vite 会自动切换到下一个可用端口。

#### 构建生产版本

```bash
npm run build
```

#### 本地预览构建结果

```bash
npm run preview
```

### 常见启动问题

- 如果端口 `5173` 被占用，Vite 会自动使用下一个可用端口。
- 如果安装依赖很慢，可以切换到更适合你网络环境的 npm 镜像源。
- 如果 AI 连接失败，请确认填写的模型服务支持浏览器跨域请求，也就是 CORS。
- 用户填写的 API Key 只保存在当前浏览器本地的 `localStorage`，不会上传到本项目服务器。

## AI 接口说明

项目默认请求兼容 OpenAI Chat Completions 的接口：

```text
POST {BASE_URL}/chat/completions
```

请求头：

```text
Content-Type: application/json
Authorization: Bearer {API_KEY}
```

需要支持：

- 普通非流式请求，用于连接测试
- `stream: true` 流式请求，用于大纲、正文和优化生成

推荐模型返回的大纲格式：

```json
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
```

当前解析逻辑也兼容部分非标准字段，例如：

- 外层字段：`outline`, `structure`, `chapters`, `sections`, `data`, `result`
- 子节点字段：`children`, `sections`, `subsections`, `items`
- 标题字段：`title`, `name`, `heading`, `chapterTitle`, `sectionTitle`

## 项目结构

```text
src/
  App.tsx                 应用入口、布局和步骤导航
  main.tsx                React 挂载入口
  pages/
    ConfigPage.tsx        AI 配置页面
    OutlinePage.tsx       大纲生成与对话修改页面
    DraftPage.tsx         初稿生成页面
    OptimizePage.tsx      内容优化与版本迭代页面
    ExportPage.tsx        Word 导出页面
  services/
    aiService.ts          AI 请求、流式处理、大纲解析和内容生成
  store/
    appSlice.ts           应用状态、AI 配置、生成进度
    projectSlice.ts       项目信息、大纲、版本、聊天记录
    index.ts              Redux Store 配置
  hooks/
    useAppDispatch.ts     Redux 类型化 Hook
  types/
    index.ts              核心类型定义
  utils/
    exportDocx.ts         Word 文档导出逻辑
```

## 稳定性设计

- AI 请求超时统一设置为 5 分钟
- 流式响应使用缓冲区处理 SSE 分包
- 大纲解析会拒绝空结果
- 对话修改失败时不会覆盖已有大纲
- 支持模型返回 Markdown 代码块包裹的 JSON
- 支持一定程度的非标准 JSON 字段兼容

## 可用脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动本地开发服务 |
| `npm run build` | TypeScript 编译并构建生产版本 |
| `npm run preview` | 本地预览生产构建 |
| `npm run lint` | 运行 ESLint 检查 |

## 适用场景

- 行业研究报告
- 企业内部分析报告
- 项目方案和汇报材料
- 市场调研文档
- 政策、技术、产品类长文档草稿

## 后续可扩展方向

- 项目数据持久化
- 登录和多用户协作
- 大纲拖拽编辑
- 多模板 Word 导出
- PDF 导出
- 模型参数可视化配置
- 生成过程取消和恢复

## License

当前仓库未声明开源许可证。如需公开发布，请根据实际情况补充 License 文件。
