# 更新日志

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本号语义化。

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
