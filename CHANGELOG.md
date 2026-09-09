# 更新日志 / Changelog

遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；版本号语义化。

## [1.2.0] - 2026-09-09

### 新增

- **定期自动清空（回收站定期清理设置）**：会话移入回收站 N 天后自动彻底删除。
  - 管理页新增设置卡片：开关「定期自动清空」+ 保留天数（1–3650）+ 检查间隔（15–1440 分钟）。
  - 设置持久化到 `dsh-home/session-cleaner-settings.json`（独立于回收站目录，不会被清空）。
  - 后台定时任务：启动 10 秒后检查一次 + 按间隔周期巡检（防重入锁、timer unref）。
  - 回收站条目展示「剩余 N 天 / 已过期·将被自动清除 / 未启用」；提供「立即清理已过期」按钮。
- **回收站列表过滤规则**：不再显示「当前列表（sessions 目录中存在的未归档可见会话）」中仍然存在的条目；
  已归档会话与已列入回收站的会话始终显示，并带「已归档 / 子代理 / 已过期」标记。
- **主题与 DSH 主体一致**：管理页内嵌 DSH design-platform 设计令牌（light/dark，逐字一致），
  全部组件改用 `--dsw-alias-*` 语义变量；页头主题切换（跟随系统/浅色/深色，localStorage 持久化）。
  主界面注入的确认弹窗与「回收站」侧边栏入口同步改用 DSH 主题变量。
- **恢复保留归档状态**：原为归档会话的回收站条目，恢复后仍回到归档区。

### 变更

- 管理页新增统计卡片（总会话数/占用磁盘/回收站条目/已过期条目）与搜索过滤。
- 会话列表为「已归档/子代理/活跃/同名冲突」增加视觉标记。
- 发布形态转为标准 npm 包（`lib/index.mjs` + `cordis.patch.yml` bundle 补丁层 + scoped 包名）。

### 修复

- 回收站内同名残留条目（上次移动中断/恢复失败遗留）处理：`moveToTrash` 先清除残留再 rename，避免 EPERM。
- GET/POST `/api/session-cleaner/settings` 合并为单路由（DSH webserver 禁止同 path 重复注册）。
- 全部 Session ID 入参增加路径穿越校验（`assertSafeSessionId`）。

## [1.1.1] - 2026-08-28

### 修复

- **「⋯」菜单不出现「移入回收站」**（关键修复）：原 React Fiber 提取只读了 DOM 元素宿主 fiber 的 `memoizedProps`——那只是 DOM 属性（className/onClick 等），组件的 `{node}` props 在 **fiber.return 链**的组件 fiber 上。修复为沿 `fiber.return` 向上遍历（≤12 层）提取 `node.id`，并保留 `__reactProps$` 展开兜底与 DOM 父元素上溯。已针对实际运行版本（dsh 0.1.1-rc.2 的 ui-workspace bundle）逐项核实：`YDXeBa_menuOpen` 行标记、Portal 菜单挂载 `document.body`、`role="menu"`/`button[role="menuitem"]` 结构、zh 文案「归档会话」精确匹配、Escape 关闭监听，全部兼容。
- 提取逻辑 5 场景验证（宿主 fiber return 链 / props 展开 / 无 fiber 拒猜 / 父元素上溯 / 超深链返回 null）全部通过。

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
- 中文管理页 `/session-cleaner`：列表、搜索、同名冲突高亮、回收站管理、`#trash` 锚点直达
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
