/**
 * test.mjs — session-cleaner 宿主插件独立单元与集成测试脚本 (v1.1.0)
 *
 * 测试目标：
 * 1. 同名重名任务误删防护断言：删除目标 ID 时，同名的其它会话及其注册项原封不动
 * 2. 物理与 JSON 注册表同步清理断言：sessionDir, workspace.json, projcache 三处全清
 * 3. 移入回收站断言：数据安全暂存 dsh-home\.session-cleaner-trash\
 * 4. 恢复断言：restoreFromTrash 完整恢复物理与 JSON 结构
 * 5. 活跃拦截断言：openStep 活跃会话拒绝删除
 * 6. 粉碎断言：purge 彻底移除
 * 7. Cordis 插件生命周期与路由注册/卸载断言
 * 8. 前端注入脚本文本包含 _menuOpen 与 #trash
 * 9. [1.1.0 新增] extractSessionPreview 功能断言 (明文 .jsonl、多帧 .zstd 解压、系统/插件消息过滤)
 * 10. [1.1.0 新增] GET /api/session-cleaner/preview 路由断言 (sessions 与 trash 来源区分、400 失败处理)
 */

import { existsSync } from 'node:fs'
import { mkdir as mkdirP, readFile as readText, rm as rmDir, writeFile as writeText } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { zstdCompressSync } from 'node:zlib'

// 导入待测组件：与本脚本同目录的插件源码（本仓库即为插件正本）。
const pluginPath = resolve(import.meta.dirname, 'session-cleaner.plugin.mjs')
if (!existsSync(pluginPath)) {
  console.error(`未找到插件源码: ${pluginPath}`)
  process.exit(1)
}
const pluginModule = await import(pathToFileURL(pluginPath).href)
const { projectKey, encodeSegment, listSessions, listTrash, moveToTrash, restoreFromTrash, purgeTrash, extractSessionPreview, apply } = pluginModule

let passes = 0
let fails = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`)
    passes++
  } else {
    console.error(`  ✗ FAIL: ${message}`)
    fails++
  }
}

async function writeJson(filePath, data) {
  await mkdirP(resolve(filePath, '..'), { recursive: true })
  await writeText(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8')
}

async function readJson(filePath) {
  const content = await readText(filePath, 'utf8')
  return JSON.parse(content)
}

async function runTests() {
  console.log('====================================================')
  console.log(' 正在测试 session-cleaner 宿主插件 (v1.1.0)...')
  console.log('====================================================\n')

  // 构造临时测试根目录 (%TEMP%\test-session-cleaner-xxxx)
  const testRoot = join(tmpdir(), `test-session-cleaner-${Date.now()}`)
  console.log(`[测试环境] 创建临时 dsh-home Mock 目录: ${testRoot}`)

  const mockWsPath = 'C:\\mock\\project'
  const wsSlug = projectKey(mockWsPath) // --C-mock-project--

  // 1. 初始化文件数据
  const wsJson = {
    unit: { name: 'workspace', version: 2 },
    global: { initialized: true, workspaceIds: ['ws-1'], archivedSessionIds: [] },
    tables: {
      workspaces: {
        'ws-1': {
          path: mockWsPath,
          title: 'Mock Project',
          sessionIds: ['session-dup-1', 'session-dup-2', 'session-live'],
        },
      },
    },
  }

  const projJson = {
    unit: { name: 'session_projcache', version: 3 },
    global: null,
    tables: {
      sessions: {
        'session-dup-1': {
          identity: { createdAt: 1000, cwd: mockWsPath },
          rows: {
            title: { ver: 1, seq: 10, val: '重名测试任务' },
            sessionStats: { ver: 1, seq: 10, val: { turns: 2, steps: 5 } },
          },
        },
        'session-dup-2': {
          identity: { createdAt: 2000, cwd: mockWsPath },
          rows: {
            title: { ver: 1, seq: 20, val: '重名测试任务' }, // 同名!
            sessionStats: { ver: 1, seq: 20, val: { turns: 4, steps: 12 } },
          },
        },
        'session-live': {
          identity: { createdAt: 3000, cwd: mockWsPath },
          rows: {
            title: { ver: 1, seq: 30, val: '活跃任务' },
            sessionStats: { ver: 1, seq: 30, val: { turns: 1, steps: 2, openStep: { turn: 1 } } }, // 活跃!
          },
        },
      },
    },
  }

  await writeJson(join(testRoot, 'storages', 'workspace.json'), wsJson)
  await writeJson(join(testRoot, 'storages', 'session_projcache.json'), projJson)

  // 物理目录结构
  const sDir1 = join(testRoot, 'sessions', wsSlug, 'session-dup-1')
  const sDir2 = join(testRoot, 'sessions', wsSlug, 'session-dup-2')
  const sDirLive = join(testRoot, 'sessions', wsSlug, 'session-live')
  const sDirUnreg = join(testRoot, 'sessions', wsSlug, 'subagent-uuid-999')

  await writeJson(join(sDir1, 'session.jsonl'), { type: 'session', id: 'session-dup-1' })
  await writeJson(join(sDir2, 'session.jsonl'), { type: 'session', id: 'session-dup-2' })
  await writeJson(join(sDirLive, 'session.jsonl'), { type: 'session', id: 'session-live' })
  await writeJson(join(sDirUnreg, 'session.jsonl'), { type: 'session', id: 'subagent-uuid-999' })

  // -------------------------------------------------------------------------
  // Test 1: listSessions 探测与重名标记判定
  // -------------------------------------------------------------------------
  console.log('\n[测试 1] listSessions 探测与重名冲突标记...')
  const sessions = await listSessions(testRoot)
  assert(sessions.length === 4, '成功扫描到 4 个物理会话目录 (3 个已注册 + 1 个未注册子代理)')

  const s1 = sessions.find((s) => s.sessionId === 'session-dup-1')
  const s2 = sessions.find((s) => s.sessionId === 'session-dup-2')
  const sLive = sessions.find((s) => s.sessionId === 'session-live')
  const sUnreg = sessions.find((s) => s.sessionId === 'subagent-uuid-999')

  assert(s1 && s1.titleCollision === true, 'session-dup-1 成功标记为 titleCollision = true')
  assert(s2 && s2.titleCollision === true, 'session-dup-2 成功标记为 titleCollision = true')
  assert(sLive && sLive.isLive === true, 'session-live 成功探测并标记为 isLive = true')
  assert(sUnreg && sUnreg.isRegistered === false, '未注册子代理目录成功标记为 isRegistered = false')

  // -------------------------------------------------------------------------
  // Test 2: 同名隔离删除 (删除 session-dup-1，断言 session-dup-2 原封不动)
  // -------------------------------------------------------------------------
  console.log('\n[测试 2] moveToTrash 同名隔离删除断言...')
  const delReport = await moveToTrash(testRoot, 'session-dup-1')
  assert(delReport.success === true, 'session-dup-1 移入回收站成功')

  // 检查 session-dup-1 清理结果
  assert(!existsSync(sDir1), 'session-dup-1 原物理目录已被移除')
  assert(existsSync(join(testRoot, '.session-cleaner-trash', 'session-dup-1', 'session-data')), 'session-dup-1 物理目录进入回收站')

  const wsJsonAfter = await readJson(join(testRoot, 'storages', 'workspace.json'))
  const projJsonAfter = await readJson(join(testRoot, 'storages', 'session_projcache.json'))

  const wsSessions = wsJsonAfter.tables.workspaces['ws-1'].sessionIds
  assert(!wsSessions.includes('session-dup-1'), 'workspace.json 已安全移除 session-dup-1')
  assert(projJsonAfter.tables.sessions['session-dup-1'] === undefined, 'session_projcache.json 已移除 session-dup-1')

  // 关键断言 (a)：同名另一会话 session-dup-2 绝对不受影响！
  assert(wsSessions.includes('session-dup-2'), '【关键安全断言】同名另一会话 session-dup-2 仍完整保存在 workspace.json 中')
  assert(projJsonAfter.tables.sessions['session-dup-2'] !== undefined, '【关键安全断言】同名另一会话 session-dup-2 仍完整保存在 session_projcache.json 中')
  assert(existsSync(sDir2), '【关键安全断言】同名另一会话 session-dup-2 物理目录原封不动')

  // -------------------------------------------------------------------------
  // Test 3: 活跃会话拒删拦截
  // -------------------------------------------------------------------------
  console.log('\n[测试 3] 活跃会话拒删拦截断言...')
  try {
    await moveToTrash(testRoot, 'session-live')
    assert(false, '应该抛错但未抛错')
  } catch (err) {
    assert(err.message.includes('活跃'), `成功拦截活跃会话删除: ${err.message}`)
  }

  // -------------------------------------------------------------------------
  // Test 4: restoreFromTrash 恢复
  // -------------------------------------------------------------------------
  console.log('\n[测试 4] restoreFromTrash 还原断言...')
  const restoreReport = await restoreFromTrash(testRoot, 'session-dup-1')
  assert(restoreReport.success === true, 'restoreFromTrash 成功')

  assert(existsSync(sDir1), 'session-dup-1 物理目录恢复成功')
  const wsJsonRestored = await readJson(join(testRoot, 'storages', 'workspace.json'))
  const projJsonRestored = await readJson(join(testRoot, 'storages', 'session_projcache.json'))

  assert(wsJsonRestored.tables.workspaces['ws-1'].sessionIds.includes('session-dup-1'), 'session-dup-1 重新插入 workspace.json')
  assert(projJsonRestored.tables.sessions['session-dup-1'] !== undefined, 'session-dup-1 重新插入 session_projcache.json')
  assert(!existsSync(join(testRoot, '.session-cleaner-trash', 'session-dup-1')), '回收站暂存项被清理')

  // -------------------------------------------------------------------------
  // Test 5: purgeTrash 彻底移除
  // -------------------------------------------------------------------------
  console.log('\n[测试 5] purgeTrash 彻底粉碎断言...')
  await moveToTrash(testRoot, 'session-dup-1')
  const purgeRes = await purgeTrash(testRoot, 'session-dup-1', 'PURGE')
  assert(purgeRes.success === true, 'purgeTrash 彻底粉碎成功')
  assert(!existsSync(join(testRoot, '.session-cleaner-trash', 'session-dup-1')), '回收站项物理移除')

  // -------------------------------------------------------------------------
  // Test 6: 插件生命周期与 Cordis WebServer 注册桩测试
  // -------------------------------------------------------------------------
  console.log('\n[测试 6] Cordis 宿主插件 apply/dispose 生命周期函数测试...')
  let effectDisposer = null
  const registeredRoutes = new Map()
  const injectListeners = []

  const mockWs = {
    register: (route) => {
      registeredRoutes.set(route.path, route)
      return () => registeredRoutes.delete(route.path)
    },
  }

  const mockCtx = {
    logger: { info: () => {}, warn: () => {} },
    inject: (deps, callback) => {
      callback({
        webServer: mockWs,
        get: () => null,
        on: (event, listener) => {
          if (event === 'webserver/index-inject') injectListeners.push(listener)
          return () => {
            const at = injectListeners.indexOf(listener)
            if (at !== -1) injectListeners.splice(at, 1)
          }
        },
      })
    },
    effect: (fn) => {
      effectDisposer = fn()
    },
  }

  apply(mockCtx, { dshHome: testRoot, verbose: false })

  assert(registeredRoutes.has('/api/session-cleaner/sessions'), '成功注册路由 /api/session-cleaner/sessions')
  assert(registeredRoutes.has('/api/session-cleaner/preview'), '成功注册新增路由 /api/session-cleaner/preview')
  assert(registeredRoutes.has('/api/session-cleaner/delete'), '成功注册路由 /api/session-cleaner/delete')
  assert(registeredRoutes.has('/session-cleaner'), '成功注册管理页路由 /session-cleaner')

  for (const route of registeredRoutes.values()) {
    assert(typeof route.handler === 'function', `路由 ${route.path} 以 route.handler 暴露处理函数`)
  }

  class MockInjectedRows {
    constructor() { this.items = []; }
    add(item) { this.items.push(item); }
    push(item) { this.items.push(item); }
  }
  const mockInj = new MockInjectedRows()
  for (const listener of injectListeners) listener(mockInj)

  const scriptRow = mockInj.items.find((r) => r.kind === 'script' && r.placement === 'body')
  assert(Boolean(scriptRow), 'webserver/index-inject 事件提交了前端入口脚本行')
  assert(scriptRow && scriptRow.text.includes('_menuOpen'), '前端注入脚本包含 _menuOpen 选择器定义')
  assert(scriptRow && scriptRow.text.includes('#trash'), '前端注入脚本包含 #trash 路由逻辑')
  assert(scriptRow && scriptRow.text.includes('/api/session-cleaner/preview'), '前端注入脚本包含 preview 端点调用逻辑')

  if (effectDisposer) effectDisposer()
  assert(registeredRoutes.size === 0, '插件卸载 disposer 成功清理所有已注册路由')
  assert(injectListeners.length === 0, '插件卸载后 index-inject 事件监听已全部移除')

  // -------------------------------------------------------------------------
  // Test 7: [v1.1.0 新增] extractSessionPreview 纯函数断言 (明文 .jsonl 提取与过滤)
  // -------------------------------------------------------------------------
  console.log('\n[测试 7] extractSessionPreview 明文 .jsonl 提取与过滤测试...')
  const sampleJsonlPath = join(testRoot, 'sample.jsonl')
  const jsonlLines = [
    JSON.stringify({ type: 'session', version: 0, id: 'sess-test-101', createdAt: 1700000000000, cwd: 'C:\\projects\\demo' }),
    JSON.stringify({ type: 'session/title', data: { title: '初始标题' } }),
    JSON.stringify({ type: 'session/title', data: { title: '最终覆盖标题' } }),
    JSON.stringify({ type: 'turn/start', time: 1700000001000, data: { turn: 1 } }),
    JSON.stringify({ type: 'user/message', seq: 1, time: 1700000002000, data: { content: [{ type: 'text', text: '这是首条用户真实指令' }], source: { kind: 'user' }, role: 'user' } }),
    JSON.stringify({ type: 'user/message', seq: 2, time: 1700000003000, data: { content: [{ type: 'text', text: '这是系统/插件注入的快照信息' }], source: { kind: 'plugin' }, role: 'user' } }),
    JSON.stringify({ type: 'tool/call', time: 1700000004000 }),
    JSON.stringify({ type: 'assistant/message', time: 1700000005000, data: { message: { content: [{ type: 'text', text: '这是助手的首次回复' }] } } }),
    JSON.stringify({ type: 'turn/start', time: 1700000006000, data: { turn: 2 } }),
    JSON.stringify({ type: 'user/message', seq: 3, time: 1700000007000, data: { content: '这是第二条用户真实指令（字符串格式）', source: { kind: 'user' }, role: 'user' } }),
    JSON.stringify({ type: 'assistant/message', time: 1700000008000, data: { message: { content: '这是助手的最终回复' } } }),
  ]
  await writeText(sampleJsonlPath, jsonlLines.join('\n'), 'utf8')

  const preview = await extractSessionPreview(sampleJsonlPath)
  assert(preview.ok === true, 'extractSessionPreview 执行成功')
  assert(preview.title === '最终覆盖标题', '正确解析最新覆盖标题')
  assert(preview.createdAt === 1700000000000, '正确解析 createdAt')
  assert(preview.lastActiveAt === 1700000008000, '正确解析 lastActiveAt')
  assert(preview.cwd === 'C:\\projects\\demo', '正确解析 cwd')
  assert(preview.turns === 2, '正确统计 turns = 2')
  assert(preview.userMessages === 2, '【系统消息过滤断言】userMessages = 2 (忽略 kind:plugin 项)')
  assert(preview.assistantMessages === 2, '正确统计 assistantMessages = 2')
  assert(preview.toolCalls === 1, '正确统计 toolCalls = 1')
  assert(preview.firstUserText === '这是首条用户真实指令', '【核心断言】正确提取 firstUserText 为首条用户指令')
  assert(preview.lastUserText === '这是第二条用户真实指令（字符串格式）', '正确提取 lastUserText')
  assert(preview.lastAssistantText === '这是助手的最终回复', '正确提取 lastAssistantText')

  // -------------------------------------------------------------------------
  // Test 8: [v1.1.0 新增] extractSessionPreview 多帧 zstd 解压断言
  // -------------------------------------------------------------------------
  console.log('\n[测试 8] extractSessionPreview 多帧 .zstd 解压测试...')
  if (typeof zstdCompressSync === 'function') {
    const frame1Text = JSON.stringify({ type: 'session', createdAt: 1710000000000, cwd: 'D:\\zstd\\test' }) + '\n' +
                       JSON.stringify({ type: 'user/message', data: { content: '第一帧中的首条指令', source: { kind: 'user' } } }) + '\n'
    const frame2Text = JSON.stringify({ type: 'assistant/message', data: { message: { content: '第二帧中的回复' } } }) + '\n'

    const bufF1 = zstdCompressSync(Buffer.from(frame1Text, 'utf8'))
    const bufF2 = zstdCompressSync(Buffer.from(frame2Text, 'utf8'))
    const multiZstdBuf = Buffer.concat([bufF1, bufF2])

    const zstdFilePath = join(testRoot, 'session.jsonl.zstd')
    await writeText(zstdFilePath, multiZstdBuf)

    const zstdPreview = await extractSessionPreview(zstdFilePath)
    assert(zstdPreview.ok === true, '多帧 zstd 解压解析成功')
    assert(zstdPreview.cwd === 'D:\\zstd\\test', 'zstd 解压提取 cwd 正确')
    assert(zstdPreview.firstUserText === '第一帧中的首条指令', '【多帧跨块断言】成功从第一帧提取 firstUserText')
    assert(zstdPreview.lastAssistantText === '第二帧中的回复', '【多帧跨块断言】成功从第二帧提取 lastAssistantText')
  } else {
    console.log('  - 当前 Node 环境不含 zstdCompressSync，跳过 zstd 测试')
  }

  // -------------------------------------------------------------------------
  // Test 9: [v1.1.0 新增] GET /api/session-cleaner/preview 路由 Handler 断言
  // -------------------------------------------------------------------------
  console.log('\n[测试 9] GET /api/session-cleaner/preview 路由 Handler 场景测试...')
  let previewHandler = null
  const testWs = {
    register: (route) => {
      if (route.path === '/api/session-cleaner/preview') previewHandler = route.handler
      return () => {}
    },
  }
  const testCtx = {
    logger: { info: () => {} },
    inject: (deps, cb) => cb({ webServer: testWs, get: () => null, on: () => () => {} }),
    effect: () => {},
  }
  apply(testCtx, { dshHome: testRoot })

  assert(typeof previewHandler === 'function', '预览路由 handler 正确注入')

  class MockResponse {
    constructor() { this.statusCode = 0; this.headers = {}; this.body = ''; }
    writeHead(code, headers) { this.statusCode = code; this.headers = headers; }
    end(str) { this.body = str; }
  }

  // (a) 缺少 sessionId -> 400
  const reqMissing = { url: '/api/session-cleaner/preview' }
  const resMissing = new MockResponse()
  await previewHandler(reqMissing, resMissing)
  assert(resMissing.statusCode === 400, '缺少 sessionId 返回 400')

  // (b) 未找到 -> 400
  const reqNotFound = { url: '/api/session-cleaner/preview?sessionId=session-not-exist-999' }
  const resNotFound = new MockResponse()
  await previewHandler(reqNotFound, resNotFound)
  assert(resNotFound.statusCode === 400, '未找到 sessionId 返回 400')

  // (c) 存在于 sessions 目录
  await writeText(join(sDir2, 'session.jsonl'), JSON.stringify({ type: 'user/message', data: { content: '单元测试指令-sDir2', source: { kind: 'user' } } }))
  const reqSessions = { url: `/api/session-cleaner/preview?sessionId=session-dup-2` }
  const resSessions = new MockResponse()
  await previewHandler(reqSessions, resSessions)
  const dataSessions = JSON.parse(resSessions.body || '{}')
  assert(resSessions.statusCode === 200, '存在会话返回 200')
  assert(dataSessions.source === 'sessions', '正确标记 source = sessions')
  assert(dataSessions.preview?.firstUserText === '单元测试指令-sDir2', '正确返回预览字段')

  // 清理临时根目录
  try {
    await rmDir(testRoot, { recursive: true, force: true })
  } catch {}

  console.log('\n====================================================')
  console.log(` 测试结束: ${passes} 通过, ${fails} 失败`)
  console.log('====================================================\n')

  if (fails > 0) {
    process.exit(1)
  }
}

runTests().catch((err) => {
  console.error('测试脚本发生未知异常:', err)
  process.exit(1)
})
