// 辅助工具：提取 lib/index.mjs 中注入的前端脚本字符串并校验其语法。
// 注入脚本以模板字符串形式嵌入宿主模块，需先按模板字符串规则反转义（\` -> `，\${ -> ${），再校验 JS 语法。
// 用法：node 辅助工具/check-injected-script.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const src = readFileSync(join(root, 'lib', 'index.mjs'), 'utf8')

const startMarker = 'text: `'
const start = src.indexOf(startMarker)
if (start === -1) {
  console.error('未找到 text: ` 标记')
  process.exit(1)
}
const rest = src.slice(start + startMarker.length)
const end = rest.indexOf('\n        `')
if (end === -1) {
  console.error('未找到注入脚本结束的反引号')
  process.exit(1)
}
const raw = rest.slice(0, end)
// 模板字符串反转义：\` -> `，\${ -> ${（\\ 保留为 \\n 等转义序列，交由 JS 解析器处理）
const script = raw.replace(/\\`/g, '`').replace(/\\\$\{/g, '${')
try {
  new Function(script)
  console.log('injected script syntax OK, length=' + script.length)
} catch (e) {
  console.error('injected script SYNTAX ERROR: ' + e.message)
  process.exit(1)
}