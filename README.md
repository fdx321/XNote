# XNote (V1.0)

XNote 是一款 macOS 本地优先（Local-first）的 Markdown/PlantUML 笔记应用，基于 Tauri + React + TypeScript。
<img width="1376" height="768" alt="image" src="https://github.com/user-attachments/assets/a842f387-ef00-4320-92cb-945ddfea5443" />

<img width="3834" height="2094" alt="image" src="https://github.com/user-attachments/assets/961a5b49-72fa-4c84-ab9a-3b06ecba5683" />



## 功能

- 文件管理：左侧树形目录、创建/重命名/复制/移动/删除
- 编辑器：Monaco 编辑器，支持编辑/预览/分屏
- 搜索：全文搜索（结果高亮、可跳转到命中行）
- 图片粘贴：粘贴截图自动落盘到 `doc/.xnote_assets/...`，Markdown 引用使用 `/.xnote_assets/...`（移动 md 文件不会失效）
- 清理未使用图片：扫描工作区图片引用，列出未引用图片并支持批量删除（支持取消、支持复制路径）
- Settings：可配置搜索快捷键（录制组合键），主题切换

## 快捷键

- 打开搜索：默认 `Cmd+G`（可在 Settings 中修改）
- 关闭弹窗：`Esc`

## 目录与存储

- 开发模式（debug）：默认工作区在 `项目根目录/xnote_dev_data/doc`
- 生产模式（release）：默认工作区在 `~/.xnote/doc`
- 配置文件：`config.json`（同一根目录下）

## 开发

### 环境要求

- Node.js 18+（推荐 20+）
- Rust stable
- macOS（本仓库目前主要面向 macOS）

### 启动

```bash
npm install
npm run tauri dev
```

## 构建发布包

```bash
npm install
npm run tauri build
```

产物通常在：

- `src-tauri/target/release/bundle/`（macOS 下包含 `.app`、可能还有 `.dmg/.pkg`，取决于 bundle targets）

## Clean Unused Images（清理未使用图片）说明

- 扫描范围：工作区 `doc` 目录下的图片文件（常见图片后缀）以及文本文件（`.md/.txt/.uml/.puml`）
- 引用解析：优先覆盖本应用生成的 `/.xnote_assets/...` 引用，同时支持常见的 `](...)` 与 `src="..."` 形式
- 扫描/删除过程：状态栏展示进度与日志，未结束前可点击 `×` 取消本次任务
- 结果确认：若存在未引用图片，会弹窗展示绝对路径列表，并可一键复制（空格分隔）
