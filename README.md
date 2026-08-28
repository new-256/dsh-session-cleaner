# DSH Session Cleaner（会话清理器）

[DSH (DeepSeek Harness)](https://github.com/deepseek-ai/deepseek-harness) 的 **Cordis 宿主插件**，给 DSH Web GUI 补上原生缺失的**会话删除能力**——以侧边栏原生交互呈现，采用**两级可恢复删除**设计与**对话内容预览/同名分辨**增强。

```
会话行「⋯」菜单：  重命名 / 分叉会话 / 归档会话 / 移入回收站 ← 本插件注入
侧边栏底部：        …工作区列表… / 🗑️ 回收站 / ⚙️ 设置        ← 本插件注入
管理页与确认弹窗：  💬 查看对话（解析首条指令、多帧 zstd 解压） ← v1.1.0 增强
```

## 功能特性

- **侧边栏原生集成**
  - 会话行「⋯」菜单末尾追加「**移入回收站**」，克隆原生菜单项样式
  - 侧边栏底部、设置行上方新增「**回收站**」入口，直达管理页回收站区块
  - 删除成功后目标行淡出消失，无需刷新
- **对话内容预览与同名分辨 (v1.1.0 新增)**
  - 支持解压读取 `.session.jsonl.zstd`（内置多帧 Zstandard 流式解压）及明文 `.jsonl`
  - 过滤 `source.kind === 'plugin'` 的系统/环境注入，精确定位真人「首条用户指令」
  - 管理页 `/session-cleaner` 会话列表与回收站表格均支持行内展开对话预览卡片
  - 删除确认弹窗自动加载目标会话及所有同名对方的「首条用户指令」摘要，彻底解决同名任务混淆问题
- **两级可恢复删除**
  - 删除 = 移入回收站（`dsh-home\.session-cleaner-trash\<sessionId>\`，含 `.trash-info.json` 元数据）
  - **恢复**：原样搬回会话目录并重写注册表（`workspace.json`、`session_projcache.json`）
  - **粉碎（purge）**：二级永久删除，需输入 `PURGE` 确认
- **同名会话防删错**（核心安全设计）
  - 定位只认 sessionId：菜单打开时目标行带唯一 `_menuOpen` 标记，从该行的 **React Fiber 节点**提取 `node.id`，绝不按标题匹配；提取失败则不注入菜单项（宁缺毋错）
  - 确认弹窗展示完整 sessionId、创建/最后活动时间、轮次、磁盘大小、工作区路径及首条用户指令
  - 存在同标题会话时，黄色警示区列出对方的短 ID、创建时间、轮次及各自的首条指令摘要，并提示"本操作只删除上方列出的这一个"
- **活跃会话保护**：`openStep` / `pendingCalls` 非空（正在运行）的会话拒绝删除，确认按钮禁用并显示原因
- **中文管理页**：`/session-cleaner`——全部会话列表（含未注册的子代理目录）、搜索、同名冲突高亮、对话预览、回收站管理（支持 `#trash` 锚点直达）

## 安装

适用于 DSH Desktop（推荐）或命令行 `dsh web`。

1. 复制 `session-cleaner.plugin.mjs` 到 profile 目录：
   - **DSH Desktop**：`%APPDATA%\DSH Desktop\dsh-home\profiles\web\`
   - **命令行 dsh**：`~/.dsh/profiles/web\`（插件按 `DSH_HOME` 环境变量自动定位数据目录，未设置时用 `~/.dsh`）
2. 在同目录 `cordis.patch.yml` 中登记条目（参照本仓库 `cordis.patch.example.yml`）：
   ```yaml
   - insert:
       - id: session-cleaner
         name: ./session-cleaner.plugin.mjs?v=2
         config:
           verbose: false
   ```
3. 保存后 DSH 会自动热加载（或重启 DSH），**刷新一次页面（F5）** 后侧边栏出现新菜单项与回收站入口。

验证：`GET /api/session-cleaner/sessions` 返回 200 即已生效。

## 使用说明

### 日常操作（GUI）

1. 鼠标悬停侧边栏任一会话 → 点「⋯」→ **移入回收站**
2. 确认弹窗核对信息（可查阅首条用户指令；同名会话会有黄色警示区列出各自指令对比）→ 点「确认移入回收站」
3. 查看对话：在管理页 `/session-cleaner` 点击「💬 查看对话」行内展开卡片，查阅创建时间、统计与首条用户指令
4. 后悔了：侧边栏点「**回收站**」入口（或浏览器开 `/session-cleaner#trash`）→ 找到该项 → **恢复**
5. 确定不要了：回收站里 **粉碎**（需输入 `PURGE` 确认）

### HTTP API

| 端点 | 说明 |
|---|---|
| `GET /api/session-cleaner/sessions` | 全部会话列表；`isLive` 只看 projcache 的 openStep/pendingCalls |
| `GET /api/session-cleaner/trash` | 回收站列表 |
| `GET /api/session-cleaner/preview?sessionId=...` | 解压/提取指定会话的对话预览 (标题、统计、首条与最新指令) |
| `POST /api/session-cleaner/delete` | `{sessionId, confirm:"DELETE"}` 移入回收站 |
| `POST /api/session-cleaner/restore` | `{sessionId}` 恢复 |
| `POST /api/session-cleaner/purge` | `{sessionId, confirm:"PURGE"}` 永久粉碎 |
| `GET /session-cleaner` | 中文管理页（支持 `#trash` 锚点与对话展开） |

示例（`$base` 为 DSH GUI 实际运行地址，端口每次重启可能变化——即浏览器打开 GUI 时地址栏里的主机与端口）：

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

## 已知边界

- **恢复的会话需重启 DSH 后**才会重新出现在侧边栏列表（宿主 workspace registry 无外部收养 API）
- 有未闭合 step 的会话会被拒绝删除（防数据截断）；状态落定后自然可删
- `isLive` 判定**不能**用 SessionStore 的内存加载状态——DSH 后端会把打开过的会话常驻内存，那样所有空闲会话都会被误判为活跃而全部拒删。本插件只认 projcache 的 `openStep`/`pendingCalls` 硬信号
- 前端选择器使用 `[class*="..."]` 包含匹配（如 `_menuOpen`），对 CSS Module 前缀变化免疫；DSH 大版本改版 DOM 结构时需重新适配

## 开发

### 热更新（改代码不用重启 DSH）

DSH 的 ESM 模块缓存不会因文件内容变化而失效。修改 `session-cleaner.plugin.mjs` 后，把 `cordis.patch.yml` 条目 `name` 的 query 版本号 +1（如 `?v=1` → `?v=2`）保存即可触发热加载。

### 测试

```powershell
node test.mjs
```

60 项断言覆盖：同名会话隔离删除、物理目录与注册表三处同步清理、回收站暂存/恢复/粉碎、活跃会话拒删、Cordis 生命周期（路由注册契约 `handler` 属性、`webserver/index-inject` 注入事件、dispose 清理）、多帧 Zstandard 流式解压、系统注入消息过滤、`extractSessionPreview` 纯函数分析、preview 路由 Mock 及前端注入脚本包含 `preview` 端点。全部在临时目录副本上运行，**不触碰真实数据**。

## 版本

见 [CHANGELOG.md](CHANGELOG.md)。当前：**v1.1.0**。

## 许可

[MIT](LICENSE)
