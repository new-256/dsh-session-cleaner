/**
 * smoke-test.mjs — dsh-session-cleaner 逻辑冒烟测试
 *
 * 在临时 dshHome 上验证核心链路：
 *   设置读写 → Session ID 安全校验 → listSessions 归档标记 →
 *   listTrash 过滤（隐藏当前列表条目/保留归档与回收站条目）→ 过期清理 →
 *   移入回收站（含同名残留清理）→ 恢复（普通 + 归档状态还原）→ 彻底清除
 *
 * 运行: node smoke-test.mjs
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const mod = await import('./lib/index.mjs')
const {
  listSessions,
  listTrash,
  moveToTrash,
  restoreFromTrash,
  purgeTrash,
  purgeExpiredTrash,
  loadSettings,
  saveSettings,
  assertSafeSessionId,
} = mod

const home = mkdtempSync(join(tmpdir(), 'sc-smoke-'))
const mk = (p) => mkdirSync(join(home, p), { recursive: true })
mk('storages')
mk('sessions/ws1/session-active-1')
mk('sessions/ws1/session-archived-1')
writeFileSync(join(home, 'sessions/ws1/session-active-1/session.jsonl'), '{"type":"session"}\n')
writeFileSync(join(home, 'sessions/ws1/session-archived-1/session.jsonl'), '{"type":"session"}\n')
writeFileSync(join(home, 'storages/workspace.json'), JSON.stringify({
  unit: { name: 'workspace', version: 2 },
  global: { initialized: true, workspaceIds: ['ws1'], archivedSessionIds: ['session-archived-1'] },
  tables: { workspaces: { ws1: { path: 'C:\\Work', title: 'Work', sessionIds: ['session-active-1', 'session-archived-1'] } } },
}))
writeFileSync(join(home, 'storages/session_projcache.json'), JSON.stringify({
  unit: { name: 'session_projcache', version: 3 },
  global: null,
  tables: {
    sessions: {
      'session-active-1': { identity: { createdAt: 1000, cwd: 'C:\\Work' }, rows: { title: { val: 'Active Session' }, sessionStats: { val: { turns: 2, steps: 3, openStep: null, pendingCalls: {} } }, sessionListMetadata: { val: { blank: false } } } },
      'session-archived-1': { identity: { createdAt: 2000, cwd: 'C:\\Work' }, rows: { title: { val: 'Archived Session' }, sessionStats: { val: { turns: 1, steps: 1, openStep: null, pendingCalls: {} } }, sessionListMetadata: { val: { blank: false } } } },
    },
  },
}))

const now = Date.now()
const trash = join(home, '.session-cleaner-trash')
mk('.session-cleaner-trash/session-deleted-1/session-data')
writeFileSync(join(trash, 'session-deleted-1/.trash-info.json'), JSON.stringify({ sessionId: 'session-deleted-1', deletedAt: now - 10 * 86400000, title: 'Deleted 10d ago', isArchived: false }))
mk('.session-cleaner-trash/session-deleted-old/session-data')
writeFileSync(join(trash, 'session-deleted-old/.trash-info.json'), JSON.stringify({ sessionId: 'session-deleted-old', deletedAt: now - 100 * 86400000, title: 'Deleted 100d ago', isArchived: false }))
// 陈旧条目：与当前列表(未归档可见会话)同 id
mk('.session-cleaner-trash/session-active-1/session-data')
writeFileSync(join(trash, 'session-active-1/.trash-info.json'), JSON.stringify({ sessionId: 'session-active-1', deletedAt: now - 5 * 86400000, title: 'Stale active', isArchived: false }))
// 归档会话条目：物理目录仍在 sessions 目录
mk('.session-cleaner-trash/session-archived-1/session-data')
writeFileSync(join(trash, 'session-archived-1/.trash-info.json'), JSON.stringify({ sessionId: 'session-archived-1', deletedAt: now - 5 * 86400000, title: 'Archived in trash', isArchived: true }))

let fail = 0
const ok = (name, cond, extra = '') => {
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''))
  if (!cond) fail++
}

let s = await loadSettings(home)
ok('settings defaults', s.autoPurgeEnabled === true && s.retentionDays === 30 && s.purgeIntervalMinutes === 60)
s = await saveSettings(home, { retentionDays: 7, autoPurgeEnabled: false })
ok('settings saved', s.retentionDays === 7 && s.autoPurgeEnabled === false)
s = await loadSettings(home)
ok('settings persisted', s.retentionDays === 7 && s.autoPurgeEnabled === false)

let threw = false
try { assertSafeSessionId('../evil') } catch { threw = true }
ok('safe-id rejects traversal', threw)
threw = false
try { assertSafeSessionId('ok-session-123') } catch { threw = true }
ok('safe-id accepts normal', !threw)

const sessions = await listSessions(home)
ok('listSessions finds 2', sessions.length === 2)
const act = sessions.find((x) => x.sessionId === 'session-active-1')
ok('active visible', act && act.isArchived === false && act.isVisible === true)
const arc = sessions.find((x) => x.sessionId === 'session-archived-1')
ok('archived flagged', arc && arc.isArchived === true && arc.isVisible === false)

const t1 = await listTrash(home, { retentionDays: 30 })
const ids = t1.map((x) => x.sessionId).sort()
ok('trash hides stale current-list entry', !ids.includes('session-active-1'), ids.join(','))
ok('trash shows archived entry', ids.includes('session-archived-1'))
ok('trash shows deleted entries', ids.includes('session-deleted-1') && ids.includes('session-deleted-old'))
const old = t1.find((x) => x.sessionId === 'session-deleted-old')
const fresh = t1.find((x) => x.sessionId === 'session-deleted-1')
ok('expired flagged', old.expired === true && fresh.expired === false)
ok('expiresAt computed', fresh.expiresAt === fresh.deletedAt + 30 * 86400000)
ok('archived trash item flagged', t1.find((x) => x.sessionId === 'session-archived-1').isArchived === true)

const purge = await purgeExpiredTrash(home, 30)
ok('purgeExpired removes only old', purge.purged.length === 1 && purge.purged[0].sessionId === 'session-deleted-old')
ok('old entry gone from disk', !existsSync(join(trash, 'session-deleted-old')))

const mv = await moveToTrash(home, 'session-active-1')
ok('moveToTrash success', mv.success)
ok('active moved off disk', !existsSync(join(home, 'sessions/ws1/session-active-1')))
const t2 = await listTrash(home, { retentionDays: 7 })
ok('moved session now in trash', t2.some((x) => x.sessionId === 'session-active-1'))

await restoreFromTrash(home, 'session-active-1')
ok('restore back to sessions', existsSync(join(home, 'sessions/ws1/session-active-1')))
ok('restore removes trash entry', !existsSync(join(trash, 'session-active-1')))
const wsAfter = JSON.parse(readFileSync(join(home, 'storages/workspace.json'), 'utf8'))
ok('restore re-registers sessionIds', wsAfter.tables.workspaces.ws1.sessionIds.includes('session-active-1'))

await moveToTrash(home, 'session-archived-1')
await restoreFromTrash(home, 'session-archived-1')
const wsAfter2 = JSON.parse(readFileSync(join(home, 'storages/workspace.json'), 'utf8'))
ok('archived restore keeps archivedSessionIds', wsAfter2.global.archivedSessionIds.includes('session-archived-1'))
ok('archived restore keeps sessionIds slot', wsAfter2.tables.workspaces.ws1.sessionIds.includes('session-archived-1'))

await moveToTrash(home, 'session-active-1')
const pp = await purgeTrash(home, 'session-active-1', 'PURGE')
ok('purgeTrash single', pp.success && !existsSync(join(trash, 'session-active-1')))

rmSync(home, { recursive: true, force: true })
console.log(fail === 0 ? '=== ALL PASS ===' : `=== ${fail} FAILURES ===`)
process.exit(fail === 0 ? 0 : 1)