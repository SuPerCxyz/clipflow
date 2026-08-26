#!/usr/bin/env node
// 打包 dist/ 为可分发 zip（Chrome Web Store 上传格式：manifest 位于压缩包根目录）。
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const DIST = join(ROOT, 'dist')

if (!existsSync(join(DIST, 'manifest.json'))) {
  console.error('dist/ 不存在，请先执行 npm run build')
  process.exit(1)
}

const { version } = JSON.parse(readFileSync(join(DIST, 'manifest.json'), 'utf8'))
const out = join(ROOT, `clipflow-v${version}.zip`)

const PYTHON_ZIP = [
  'import os, sys, zipfile',
  'out = sys.argv[1]',
  "z = zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED)",
  "for root, _, files in os.walk('.'):",
  "    for f in files:",
  "        p = os.path.join(root, f)",
  "        z.write(p, os.path.relpath(p, '.'))",
  'z.close()',
].join('\n')

let ok = false
// 优先系统 zip；缺失时回退 python3（均为参数化调用，不经 shell）
for (const attempt of [
  () => spawnSync('zip', ['-qr', out, '.'], { cwd: DIST, stdio: 'inherit' }),
  () => spawnSync('python3', ['-c', PYTHON_ZIP, out], { cwd: DIST, stdio: 'inherit' }),
]) {
  const r = attempt()
  if (r.status === 0 && existsSync(out)) {
    ok = true
    break
  }
}

if (!ok) {
  console.error('打包失败：需要系统 zip 或 python3 之一')
  process.exit(1)
}

const size = (statSync(out).size / 1024).toFixed(1)
console.log(`✓ ${out} (${size} KB)`)
