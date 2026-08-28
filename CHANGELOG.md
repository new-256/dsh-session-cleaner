# 更新日志

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本号语义化。

## [1.1.0] - 2026-08-28

### 核心新特性

- **对话内容预览与同名分辨 (Session Preview)**：
  - 支持从会话日志（明文 `.jsonl` 或多帧 `.session.jsonl.zstd`）提取完整对话快照
  - 新增纯函数 `extractSessionPreview(filePath)`：智能解析 `title`、`createdAt`、`lastActiveAt`、`cwd`、`turns`、`userMessages`、`assistantMessages`、`toolCalls`，并提取首条用户指令 (`firstUserText`)、最近用户指令 (`lastUserText`)、最近助手回复 (`lastAssistantText`)
  - 多帧 Zstandard 流式解压支持：基于 `node:zlib` 原生 `zstdDecompressSync` 实现多帧 Magic (0x28 0xB5 0x2F 0xFD) 边界解析与拼装
  - 系统注入消息过滤：自动过滤 `source.kind === 'plugin'` 的 runtime 快照与系统注入，确保首条用户指令 100% 为真人提示词
- **HTTP API 增强**：
  - 新增端点 `GET /api/session-cleaner/preview?sessionId=...`：自动检索回收站及活跃工作区目录，返回预览 JSON 及来源标识 (`trash` / `sessions`)
- **管理页 `/session-cleaner` UI 升级**：
  - 会话列表与回收站表格均新增「💬 查看对话」按钮，支持行内折叠/展开预览卡片
  - 展开卡片突出高亮「首条用户指令 (同名分辨核心)」，展示对话轮次与消息统计
- **删除确认弹窗 (Injected Modal) 升级**：
  - 删除确认弹窗懒加载并展示目标会话首条用户指令摘要 (200 字符)
  - 同名冲突警示区为每个同名对方并发加载其首条用户指令摘要，防止误删同名任务

---

## [1.0.0] - 2026-08-28

首个正式版。已在 DSH Desktop 实机验证（8 会话共存、含 2 个同标题会话的完整场景）。

### 核心能力

- 会话行「⋯」菜单注入「移入回收站」（克隆原生菜单项，Portal 菜单 MutationObserver）
- 侧边栏底部「回收站」入口（克隆设置触发行样式，React 重渲染自动重注入）
- 两级删除：回收站（默认）/ 粉碎（需 `PURGE` 确认）；恢复完整还原物理目录与注册表
- 中文管理页 `/session-cleaner`：列表、搜索、同名冲突高亮、回收站管理、`#trash` 锚点
- HTTP API：sessions / trash / delete / restore / purge

### 安全设计

- 同名防删错：仅按 sessionId 定位（菜单打开行的 React Fiber 提取 `node.id`），绝不按标题匹配
- 活跃保护：projcache `openStep`/`pendingCalls` 非空即拒删
- 两步确认弹窗：完整 sessionId + 时间 + 轮次 + 大小；同名时警示区展示对方摘要

### 开发历程中修复的关键问题

- 路由契约：DSH webServer 派发调用 `route.handler`（非 `handle`）
- 前端注入：通过 `webserver/index-inject` 事件（无 `addIndexInjection` API）
- 活跃误判：放弃 SessionStore 内存状态判活（后端常驻全部打开过的会话），改用 projcache 硬信号
- ESM 缓存：`?v=N` query 版本号热加载机制
