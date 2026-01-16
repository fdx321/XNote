# XNote (V1.0)

XNote 是一款 macOS 本地优先（Local-first）的 Markdown/PlantUML 笔记应用，基于 Tauri + React + TypeScript。
https://deepwiki.com/fdx321/XNote/1-overview

## 截图

<img width="1376" height="768" alt="image" src="https://github.com/user-attachments/assets/09ec72f1-f917-4ff0-a61f-422f4da6c19c" />


<img width="3454" height="2170" alt="image" src="https://github.com/user-attachments/assets/d8487cfb-ce5e-477c-8a02-104cd5d5eff8" />


## 功能

### 📁 文件管理
- 树形目录导航，支持多层级文件夹
- 创建/重命名/复制/移动/删除笔记和文件夹
- 拖拽移动文件（Drag & Drop）
- 卡片视图模式（Card View）：网格展示文件夹内容
- 右键菜单：快速访问常用操作

### ✏️ 编辑器
- **Monaco Editor**：VS Code 同款编辑器，语法高亮
- **三种视图模式**：编辑 | 预览 | 分屏
- **Markdown 支持**：GitHub Flavored Markdown（表格、任务列表等）
- **代码块高亮**：支持多种编程语言语法高亮
- **图片粘贴**：粘贴截图自动保存到 `.xnote_assets/` 目录，使用相对路径引用

### 📊 图表支持
- **Mermaid 图表**：实时渲染流程图、时序图等
- **PlantUML 图表**：编码渲染 UML 图表

### 🔍 搜索
- 全文搜索：扫描所有笔记内容
- 结果高亮：跳转到命中行号
- 搜索弹窗：快捷键快速访问

### 🤖 LLM 集成
- 支持 OpenAI、Ollama、自定义 API
- 侧边栏聊天面板（AI 助手）
- 系统提示词管理：预设不同任务提示
- 右键菜单：将选中文本发送到聊天
- 聊天历史持久化

### 💻 集成终端
- 底部终端面板：基于 xterm.js
- PTY 支持：使用 portable-pty 集成系统 Shell
- 快捷键切换：一键显示/隐藏终端
- 自动适应：终端大小随面板调整
- 会话管理：支持创建、写入、调整大小、关闭

### ⚙️ 设置与定制
- **主题切换**：三种深色主题（Zinc、Midnight、Grape）
- **快捷键配置**：自定义所有键盘快捷键
- **LLM 配置**：管理 API 密钥、端点、模型
- **系统提示词**：创建和管理自定义提示词

### 🧹 工具
- 清理未使用图片：扫描工作区，批量删除未被引用的图片
- 通知系统：Toast 消息提示
- 关于弹窗：显示版本和配置信息

## 快捷键

| 功能 | 默认快捷键 | 可自定义 |
|------|-----------|---------|
| 打开搜索 | `Cmd+G` | ✅ |
| 切换侧边栏 | `Cmd+1` | ✅ |
| 切换 AI 聊天面板 | `Cmd+2` | ✅ |
| 切换终端面板 | `Cmd+3` | ✅ |
| 关闭编辑器 | `Cmd+W` | ✅ |
| 关闭弹窗 | `Esc` | ❌ |

## 主题

| 主题 | 描述 |
|------|------|
| Zinc | 中性深色（默认） |
| Midnight | 蓝色深色 |
| Grape | 紫色深色 |

## 目录与存储

- **开发模式**（debug）：`项目根目录/xnote_dev_data/doc`
- **生产模式**（release）：`~/.xnote/doc`
- **配置文件**：`config.json`（同一根目录下）
- **图片资源**：`.xnote_assets/`（自动创建）

## 配置示例

```json
{
  "sidebarWidth": 256,
  "sidebarOpen": true,
  "editorMode": "split",
  "theme": "zinc",
  "shortcuts": {
    "search": "Cmd+G",
    "sidebar": "Cmd+1",
    "closeEditor": "Cmd+W",
    "llmPanel": "Cmd+2",
    "terminal": "Cmd+3"
  },
  "llm": {
    "configs": [
      {
        "id": "xxx",
        "name": "OpenAI",
        "provider": "openai",
        "apiKey": "...",
        "endpoint": "https://api.openai.com/v1",
        "model": "gpt-4"
      }
    ],
    "activeId": "xxx",
    "panelWidth": 300,
    "systemPrompts": [],
    "activeSystemPromptId": null
  },
  "terminal": {
    "height": 300
  }
}
```

## 技术栈

### 前端
- React 19 + TypeScript + Vite
- Tailwind CSS（样式）
- Zustand（状态管理）
- Monaco Editor（编辑器）
- react-markdown（Markdown 渲染）
- Mermaid（图表渲染）
- @dnd-kit（拖拽）
- xterm.js（终端模拟）
- @xterm/addon-fit（终端自适应）
- @xterm/addon-web-links（Web 链接）

### 后端
- Tauri（桌面应用框架）
- Rust（系统调用）
- portable-pty（伪终端）

## 开发

### 环境要求

- Node.js 18+（推荐 20+）
- Rust stable
- macOS（当前主要支持）

### 启动

```bash
npm install
npm run tauri dev
```

### 构建发布包

```bash
npm install
npm run tauri build
```

产物位置：`src-tauri/target/release/bundle/`（包含 `.app`，可能还有 `.dmg`/`.pkg`）

## Clean Unused Images（清理未使用图片）

- **扫描范围**：工作区 `doc` 目录下的图片文件和文本文件（`.md/.txt/.uml/.puml`）
- **引用解析**：优先匹配 `/.xnote_assets/...` 引用，同时支持 `](...)` 与 `src="..."` 形式
- **扫描/删除过程**：状态栏展示进度与日志，可点击 `×` 取消
- **结果确认**：未引用图片弹窗展示绝对路径列表，可一键复制

## 项目结构

```
XNote/
├── src/                  # 前端源码
│   ├── components/        # React 组件
│   │   ├── Editor.tsx     # 编辑器
│   │   ├── Sidebar.tsx    # 文件树
│   │   ├── LLMPanel.tsx   # AI 聊天面板
│   │   ├── TerminalPanel.tsx # 终端面板
│   │   └── ...
│   ├── store/             # Zustand 状态管理
│   ├── utils/             # 工具函数
│   └── App.tsx            # 主应用
├── src-tauri/            # Rust 后端
│   └── src/
│       └── lib.rs         # Tauri 命令
├── package.json
└── README.md
```

## 许可证

MIT License
