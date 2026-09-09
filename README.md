# dsh-session-cleaner

> DSH (DeepSeek Harness) 会话回收站与清理管理器 · Trash bin & session cleaner for DeepSeek Harness

给 DSH Web GUI 补上原生缺失的**会话删除能力**——以侧边栏原生交互呈现，采用**两级可恢复删除**设计，
内置**重名防误删**、**对话内容预览/同名分辨**、**定期自动清空**能力，界面主题与 DSH 主体完全一致。

Adds native, **reversible session deletion** to the DSH Web GUI — a two-level recoverable trash bin with a
name-collision guard, conversation preview, scheduled auto-purge, and DSH-native theming.

```
会话行「⋯」菜单：  重命名 / 分叉会话 / 归档会话 / 移入回收站 ← 本插件注入
侧边栏底部：        …工作区列表… / 🗑️ 回收站 / ⚙️ 设置        ← 本插件注入
管理页与确认弹窗：  💬 查看对话 · 定期清空设置 · 同名对照      ← v1.2.0 增强
```

> 说明 / Note：npm 上另有同名裸包 `dsh-session-cleaner`（fountunt 发布，专注 live store detach）。
> 本包是**功能完整的回收站方案**（移入/恢复/彻底清除/定期清空/防误删/预览），两者互不冲突；
> 为避免混淆，本包以 scoped 名 **`@luchenglong/dsh-session-cleaner`** 发布。

---

## 功能特性 / Features

- 🗑️ **可逆回收站 Reversible trash**：移入回收站（物理目录移至 `dsh-home/.session-cleaner-trash\<id>\`，
  清理 workspace.json / session_projcache），可随时**恢复**或**彻底清除**。
- ⚠️ **重名防误删 Name-collision guard**：从 React Fiber 精确提取 sessionId，永不按标题猜 id；
  二次确认弹窗展示同名会话摘要与**首条指令对照**。
- 💬 **对话内容预览 Conversation preview**：多帧 zstd 解压 + JSONL 提取（标题/轮次/用户与助手消息/
  首条指令高亮），自动过滤系统注入消息，首条用户指令 100% 为真人提示词。
- 🧹 **定期自动清空 Scheduled auto-purge**：会话移入回收站 N 天后自动彻底删除（可开关、可调天数与
  检查间隔），回收站内展示剩余天数/过期状态。
- 🎨 **主题与 DSH 主体一致 DSH-native theming**：内嵌官方 design-platform 设计令牌（light/dark），
  全部组件使用 `--dsw-alias-*` 语义变量；主界面注入的弹窗同步跟随。
- 🛡️ **安全加固**：Session ID 路径穿越校验；残留条目清理；活跃会话（projcache openStep/pendingCalls
  非空）拒绝删除。

## 安装 / Install

要求：DSH Desktop ≥ 0.3.15（`@deepseek-ai/dsh >= 0.1.1-rc.2`），Node ≥ 20。

### 方式一：npm 安装（推荐） / Install from npm (recommended)

```bash
dsh plugin --profile web add @luchenglong/dsh-session-cleaner
```

安装后 bundle 补丁层自动注册插件（`dsh.bundle.patch → cordis.patch.yml`，`id: session-cleaner`）。

### 方式二：本地包安装 / Install from a local package

```bash
dsh plugin --profile web add <本包路径>
```

### 方式三：手动放置 / Manual install

把 `lib/index.mjs` 放到 `dsh-home` 根目录（如 `session-cleaner.plugin.mjs`），并在用户层补丁
`dsh-home/cordis.patch.yml` 增加：

```yaml
- insert:
    - id: session-cleaner
      name: file:///C:/.../dsh-home/session-cleaner.plugin.mjs
      config:
        verbose: false
```

保存后 DSH 自动热加载（或重启），**刷新一次页面（F5）** 后侧边栏出现「回收站」入口与菜单项。
机器特定配置写在用户层补丁的**同 id 行**即可整体覆盖 bundle 层默认值。

验证：`GET /api/session-cleaner/sessions` 返回 200 即已生效。

## 使用 / Usage

### 日常操作（GUI）

1. 鼠标悬停侧边栏任一会话 → 点「⋯」→ **移入回收站**
2. 确认弹窗核对信息（完整 sessionId、首条用户指令；同名会话有黄色警示区列出各自指令对比）→ 确认
3. 查看对话：管理页 `/session-cleaner` 点「💬 查看对话」行内展开卡片
4. 后悔了：侧边栏「🗑️ 回收站」（或 `/session-cleaner#trash`）→ 找到该项 → **恢复**
   - 回收站视图只展示回收站与设置，不显示工作区会话；页头「💬 会话列表」按钮可切换回完整管理页
5. 确定不要了：回收站里**彻底清除**；或交给**定期自动清空**到期自动处理

### 定期清空设置 / Auto-purge settings

管理页「回收站」区块设置卡片：开关「定期自动清空」+ 保留天数（1–3650）+ 检查间隔（15–1440 分钟）。
持久化到 `dsh-home/session-cleaner-settings.json`（独立文件，不会被清空）。
默认：开启、保留 30 天、每 60 分钟检查一次；另有「🧹 立即清理已过期」按钮。

### 回收站显示规则 / Trash list semantics

| 条目状态 | 是否显示 |
| --- | --- |
| 已在回收站且不在当前列表 | ✅ 显示 |
| 已归档会话（含删除时归档、workspace.json 仍标记归档） | ✅ 显示（「已归档」标记） |
| 会话仍在「当前列表」（sessions 目录中未归档可见会话） | ❌ 隐藏（视为陈旧/重复备份） |

## HTTP API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/session-cleaner/sessions` | 会话列表（含 archived/subagent/visible/live 标记；isLive 只看 projcache 的 openStep/pendingCalls） |
| GET | `/api/session-cleaner/trash` | 回收站列表（服务端过滤 + 过期/剩余天数计算） |
| GET/POST | `/api/session-cleaner/settings` | 读取 / 保存定期清空设置 |
| POST | `/api/session-cleaner/purge-expired` | 立即清理已过期条目 |
| GET | `/api/session-cleaner/preview?sessionId=` | 对话内容预览（zstd 解压 + JSONL 提取） |
| POST | `/api/session-cleaner/delete` | `{ sessionId, confirm: "DELETE" }` 移入回收站 |
| POST | `/api/session-cleaner/restore` | `{ sessionId }` 恢复 |
| POST | `/api/session-cleaner/purge` | `{ sessionId, confirm: "PURGE" }` 或 `confirm: "PURGE-ALL"` |
| GET | `/session-cleaner` | 管理页（支持 `#trash` 锚点与对话展开） |

示例（`$base` 为 DSH GUI 实际运行地址，端口每次重启可能变化）：

```powershell
$base = 'http://127.0.0.1:58644'   # 以实际 GUI 地址为准

# 列出会话（观察 isLive / titleCollision 字段）
Invoke-RestMethod "$base/api/session-cleaner/sessions"

# 获取指定会话的对话预览（同名分辨核心）
Invoke-RestMethod "$base/api/session-cleaner/preview?sessionId=session-xxxxxxxx"

# 移入回收站
Invoke-RestMethod "$base/api/session-cleaner/delete" -Method Post -ContentType 'application/json' `
  -Body '{"sessionId":"session-xxxxxxxx","confirm":"DELETE"}'
```

## 数据布局 / On-disk layout

```
dsh-home/
├── .session-cleaner-trash/
│   └── <sessionId>/
│       ├── .trash-info.json      # { deletedAt, title, originalWorkspacePath, originalSessionDir, targetWsId, projRecord, isSubagent, isArchived }
│       └── session-data/         # 原会话物理目录
├── session-cleaner-settings.json # 定期清空设置（保留天数/开关/检查间隔）
└── sessions/…                    # 未受影响
```

## 已知边界 / Known boundaries

- **恢复的会话需重启 DSH 后**才会重新出现在侧边栏列表（宿主 workspace registry 无外部收养 API）
- 有未闭合 step 的会话会被拒绝删除（防数据截断）；状态落定后自然可删
- `isLive` 判定**不能**用 SessionStore 的内存加载状态——DSH 后端会把打开过的会话常驻内存，那样所有空闲会话都会被误判为活跃而全部拒删。本插件只认 projcache 的 `openStep`/`pendingCalls` 硬信号
- 前端选择器使用 `[class*="..."]` 包含匹配（如 `_menuOpen`），对 CSS Module 前缀变化免疫；DSH 大版本改版 DOM 结构时需重新适配
- 自动清空是**不可逆**操作：开启后到期条目会被后台任务直接删除；如不希望自动删除请关闭开关

## 开发 / Development

### 布局

- `lib/index.mjs`：单文件宿主插件（`export const name = 'session-cleaner'` + `apply(ctx, config)`）；
  无 client 半边（注入脚本由 `webserver/index-inject` 事件服务端下发）
- `cordis.patch.yml`：bundle 补丁层（`package.json` 的 `dsh.bundle.patch` 声明）
- `smoke-test.mjs`：逻辑冒烟测试（25 项断言，临时 dshHome 副本上运行，不触碰真实数据）

### 热更新（改代码不用重启 DSH）

DSH 的 ESM 模块缓存不会因文件内容变化而失效。手动放置部署时，修改源码后把 `cordis.patch.yml`
条目 `name` 的 query 版本号 +1（如 `?v=7` → `?v=8`）保存即可触发热加载。

### 测试

```bash
node smoke-test.mjs     # 25 项断言：设置读写/安全校验/归档标记/回收站过滤/过期清理/移入/恢复/归档还原/彻底清除
node --check lib/index.mjs
```

## 兼容性 / Compatibility

| 项 | 值 |
| --- | --- |
| `@deepseek-ai/dsh` | `>= 0.1.1-rc.2`（测试于 0.1.2-alpha.5） |
| DSH Desktop | `>= 0.3.15` |
| Node.js | `>= 20` |

## 版本 / Version

见 [CHANGELOG.md](CHANGELOG.md)。当前：**v1.2.0**。

## License

[MIT](./LICENSE) © 2026 new-256