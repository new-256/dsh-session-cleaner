# @luchenglong/dsh-session-cleaner 交接文档

> **交接日期**: 2026-10-07
> **插件版本**: 1.2.1
> **适配 DSH 版本**: 0.1.7-rc.1（当前）→ 0.2.0-rc.2（升级目标，已兼容）
> **源码位置**: `Desktop\codebuddy-bridge\dsh-session-cleaner`
> **npm**: https://www.npmjs.com/package/@luchenglong/dsh-session-cleaner
> **GitHub**: https://github.com/new-256/dsh-session-cleaner

---

## 一、这个插件是什么

DSH 的**会话回收站与清理管理器**（侧边栏会话任务的删除管理）：

| 能力 | 作用 |
|---|---|
| 移入回收站 | 安全删除会话，可恢复 |
| 恢复 | 从回收站还原会话 |
| 彻底清除 | 永久删除回收站内容 |
| 重名防误删 | 同名会话恢复时自动处理，避免覆盖 |
| 对话内容预览 | 删除/恢复前可预览 |
| 定期自动清空 | 按设置定时清理回收站 |
| 主题一致 | 与 DSH 主体主题统一 |

---

## 二、运行/加载机制

1. 入口（`main`）：`lib/index.mjs`
2. 经 `cordis.patch.yml` 注册，挂载侧边栏会话操作（Client 面）
3. 冒烟测试：`smoke-test.mjs`
4. 独立仓库维护（曾被误作为 codebuddy-bridge 的嵌套 gitlink，已改为独立仓库 + codebuddy 侧 .gitignore）

---

## 三、0.2.0 兼容性（已验证）

| 检查项 | 结论 |
|---|---|
| peerDependencies | **无声明** → 0.2.0 强制校验通过，**无需 version-exemption** |
| 纯客户端管理 | 复用产品会话数据，与 Host API 耦合低 |

> 该包运行形态还涉及 `dsh-home\session-cleaner.plugin.mjs`（家级独立 .mjs 部署），与 npm 包内容同源。

---

## 四、构建 / 测试 / 发布

- 无编译步骤（`lib/index.mjs`）；冒烟测试：`smoke-test.mjs`
- **发布流程**：
  ```bash
  # 改代码 → bump version + CHANGELOG → git commit + tag
  git tag vX.Y.Z && git push --tags
  npm publish --registry=https://registry.npmjs.org
  ```
- 包名带 scope `@luchenglong`，首次发布 scoped 包需 `--access public`（publishConfig 已配）
- npm 2FA：用勾选 "Bypass 2FA" 的 Granular Token，或 `--otp=xxxxxx`

---

## 五、接手注意事项

1. 包名 `@luchenglong/dsh-session-cleaner`，与家级裸 .mjs 部署同源；改动后两处都要同步。
2. 删除/回收站逻辑涉及用户数据，改动需保证"可恢复"路径不被破坏。
3. 相关文档：`README.md`、`CHANGELOG.md`。
