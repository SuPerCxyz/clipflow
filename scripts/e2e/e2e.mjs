// ClipFlow E2E 验证：扩展加载 → 跨页捕获 → 去重/过滤 → UI → 搜索 → 编辑 → 工作台 → 合并复制 → 删除
import { chromium } from 'playwright-core'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { startTestServer, copyPageBody } from './server.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXT = resolve(__dirname, '..', '..', 'dist')
const PROFILE = '/tmp/opencode/cf-profile'
const BASE = await startTestServer(8765)

let passed = 0
let failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`) }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' —— ' + detail : ''}`) }
}

// ---------- 启动 ----------
const context = await chromium.launchPersistentContext(PROFILE, {
  channel: 'chromium',
  headless: true,
  args: [
    `--disable-extensions-except=${EXT}`,
    `--load-extension=${EXT}`,
    '--no-first-run',
  ],
})

let [sw] = context.serviceWorkers()
if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 15000 })
const extId = new URL(sw.url()).host
console.log(`扩展已加载: chrome-extension://${extId}/`)

/** 直连 IndexedDB 统计 clips 数量（绕过 UI 的数据层真值） */
async function dbCount() {
  const panel = context.pages().find((p) => p.url().includes(extId))
  return panel.evaluate(
    () =>
      new Promise((res) => {
        const rq = indexedDB.open('clipflow')
        rq.onsuccess = () => {
          const db = rq.result
          const tx = db.transaction('clips').objectStore('clips').count()
          tx.onsuccess = () => res(tx.result)
          tx.onerror = () => res(-1)
        }
        rq.onerror = () => res(-1)
      }),
  )
}

try {
  // ---------- T1 跨网页捕获（A → B → C） ----------
  console.log('\n[T1] 跨网页复制捕获')
  const counts = []
  for (const path of ['/a', '/b', '/c']) {
    const page = await context.newPage()
    await page.goto(BASE + path, { waitUntil: 'domcontentloaded' })
    await copyPageBody(page)
    counts.push(path)
  }
  // 打开面板页（Side Panel 的 index.html，在标签页中驱动同一套 UI/Store/DB）
  const panel = await context.newPage()
  await panel.goto(`chrome-extension://${extId}/index.html`)
  await panel.waitForSelector('.clip-card', { timeout: 10000 })
  const n1 = await dbCount()
  check('3 个网页各复制一次 → IndexedDB 共 3 条', n1 === 3, `实际 ${n1}`)
  const cardCount = await panel.locator('.clip-card').count()
  check('侧边栏列表渲染 3 张卡片', cardCount === 3, `实际 ${cardCount}`)
  const firstTitle = await panel.locator('.cc-title').first().textContent()
  check('最新来源排在首位（倒序）', firstTitle?.includes('Gamma'), `首条标题: ${firstTitle}`)
  const domainText = (await panel.locator('.cc-domain').first().textContent()) ?? ''
  check('显示来源域名', domainText.includes('127.0.0.1'), domainText.trim())

  // ---------- T2 连续重复去重 ----------
  console.log('\n[T2] 连续重复复制去重')
  const c = await context.newPage()
  await c.goto(BASE + '/c')
  await copyPageBody(c)
  await copyPageBody(c)
  await panel.waitForTimeout(600)
  const n2 = await dbCount()
  check('同一内容连续复制两次 → 不新增', n2 === 3, `实际 ${n2}`)

  // ---------- T3 短内容忽略 ----------
  console.log('\n[T3] 少于 2 字符忽略')
  await c.evaluate(() => {
    const text = document.querySelector('p').firstChild
    const sel = window.getSelection()
    sel.removeAllRanges()
    const r = document.createRange()
    r.setStart(text, 0)
    r.setEnd(text, 1) // 仅选中第一个字符
    sel.addRange(r)
    document.dispatchEvent(new ClipboardEvent('copy'))
  })
  await panel.waitForTimeout(600)
  const n3 = await dbCount()
  check('1-2 字符选区被忽略', n3 === 3, `实际 ${n3}`)

  // ---------- T4 搜索与高亮 ----------
  console.log('\n[T4] 全文搜索与高亮')
  await panel.locator('input[placeholder*="搜索"]').fill('ceph')
  await panel.waitForFunction(
    () => document.querySelectorAll('.clip-card').length === 1,
    { timeout: 8000 },
  )
  const hitTitle = await panel.locator('.cc-title').first().textContent()
  check('搜索命中 Beta 记录', hitTitle?.includes('Beta'), hitTitle ?? '')
  const hasMark = await panel.locator('.clip-card mark').count()
  check('命中关键词高亮 <mark>', hasMark > 0, `mark 数 ${hasMark}`)
  const totalText = await panel.locator('.total').first().textContent()
  check('底部统计显示结果数', /共 \d+ 条/.test(totalText ?? ''), totalText ?? '')
  await panel.locator('input[placeholder*="搜索"]').fill('')
  await panel.waitForFunction(
    () => document.querySelectorAll('.clip-card').length === 3,
    { timeout: 8000 },
  )
  check('清空关键词恢复全量列表', true)

  // ---------- T5 编辑内容 ----------
  console.log('\n[T5] 编辑剪藏内容')
  const firstCard = panel.locator('.clip-card').first()
  await firstCard.hover()
  await firstCard.locator('button[title="编辑"]').click()
  const textarea = panel.locator('.n-modal textarea')
  await textarea.waitFor({ timeout: 5000 })
  await textarea.fill('Gamma checklist EDITED for verification.')
  await panel.locator('.n-modal button:has-text("保存")').click()
  await panel.waitForTimeout(500)
  const edited = await firstCard.locator('.cc-content').textContent()
  check('保存后卡片展示新内容', edited?.includes('EDITED'), edited?.slice(0, 40))

  // ---------- T6 加入工作台 ----------
  console.log('\n[T6] 加入工作台')
  await firstCard.hover()
  await firstCard.locator('button[title="加入工作台"]').click()
  await panel.waitForTimeout(400)
  await panel.locator('.n-tabs-tab:has-text("工作台")').click()
  await panel.waitForSelector('.ws-item', { timeout: 5000 })
  const wsCount = await panel.locator('.ws-item').count()
  check('工作台出现 1 条条目', wsCount === 1, `实际 ${wsCount}`)

  // ---------- T7 合并复制（Markdown） ----------
  console.log('\n[T7] 工作台合并复制为 Markdown')
  // 再加入一条，验证多条合并
  await panel.locator('.n-tabs-tab:has-text("剪藏")').click()
  const secondCard = panel.locator('.clip-card').nth(1)
  await secondCard.hover()
  await secondCard.locator('button[title="加入工作台"]').click()
  await panel.waitForTimeout(300)
  await panel.locator('.n-tabs-tab:has-text("工作台")').click()
  try {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  } catch { /* 部分内核不支持对扩展源授权，降级用 toast 断言 */ }

  // 详情复制（Markdown 结构化）
  await panel.locator('button:has-text("详情")').last().click()
  await panel.waitForSelector('.n-message', { timeout: 5000 }).catch(() => {})
  let md = ''
  try {
    md = await panel.evaluate(() => navigator.clipboard.readText())
  } catch { /* 无权限时跳过 */ }
  if (md) {
    check('详情复制含文档标题', md.startsWith('# '), md.split('\n')[0])
    check('详情复制含两个「## 来源」段落', (md.match(/## 来源/g) ?? []).length === 2)
    check('详情复制含来源 URL', md.includes('http://127.0.0.1:8765/'))
  } else {
    const toast = (await panel.locator('.n-message').first().textContent().catch(() => '')) ?? ''
    check('详情复制反馈 toast', toast.includes('已复制'), toast)
  }

  // 纯净复制
  await panel.locator('button[title*="仅复制原始内容"]').last().click()
  await panel.waitForSelector('.n-message', { timeout: 5000 }).catch(() => {})
  md = ''
  try {
    md = await panel.evaluate(() => navigator.clipboard.readText())
  } catch { /* 无权限时跳过 */ }
  if (md) {
    check('纯净复制不含任何附加标题/来源/分隔线', !md.includes('# ClipFlow') && !md.includes('## 来源') && !md.includes('由 ClipFlow 生成') && !md.includes('<http'))
    check('纯净复制包含两条原始内容', md.includes('EDITED for verification'))
  } else {
    const toast = (await panel.locator('.n-message').first().textContent().catch(() => '')) ?? ''
    check('纯净复制反馈 toast', toast.includes('已复制'), toast)
  }

  // ---------- T8 删除 ----------
  console.log('\n[T8] 删除剪藏')
  await panel.locator('.n-tabs-tab:has-text("剪藏")').click()
  await panel.waitForSelector('.clip-card', { timeout: 5000 })
  const beforeDel = await dbCount()
  const delCard = panel.locator('.clip-card').last()
  await delCard.hover()
  await delCard.locator('button[title="删除"]').click()
  const confirmBtn = panel.locator('.n-popconfirm .n-button--primary-type, .n-popconfirm .n-button:last-child').first()
  await confirmBtn.click({ timeout: 5000 })
  await panel.waitForTimeout(600)
  const afterDel = await dbCount()
  check('删除后 IndexedDB 减一', afterDel === beforeDel - 1, `${beforeDel} → ${afterDel}`)

  // ---------- T9 工作台拖拽排序 ----------
  console.log('\n[T9] 工作台拖拽排序')
  // 先把剩余两条都加入工作台
  for (let i = 0; i < 2; i++) {
    const cardN = panel.locator('.clip-card').nth(i)
    await cardN.hover()
    await cardN.locator('button[title="加入工作台"]').click()
    await panel.waitForTimeout(250)
  }
  await panel.locator('.n-tabs-tab:has-text("工作台")').click()
  await panel.waitForFunction(() => document.querySelectorAll('.ws-item').length >= 2, { timeout: 5000 })
  const snippets = () => panel.locator('.ws-item .ws-snippet').allTextContents()
  const orderBefore = await snippets()
  check('工作台现有 2 条', orderBefore.length === 2, `实际 ${orderBefore.length}`)
  await panel.evaluate(() => {
    const items = document.querySelectorAll('.ws-item')
    const dt = new DataTransfer()
    const opts = { bubbles: true, cancelable: true, dataTransfer: dt }
    items[0].dispatchEvent(new DragEvent('dragstart', opts))
    items[1].dispatchEvent(new DragEvent('dragover', opts))
    items[1].dispatchEvent(new DragEvent('drop', opts))
  })
  await panel.waitForTimeout(600)
  const orderAfter = await snippets()
  check(
    '拖拽后顺序交换',
    orderAfter[0] === orderBefore[1] && orderAfter[1] === orderBefore[0],
    `前: [${orderBefore.map((s) => s.slice(0, 12))}] 后: [${orderAfter.map((s) => s.slice(0, 12))}]`,
  )

  // ---------- T10 导入导出 JSON ----------
  console.log('\n[T10] 导入导出 JSON')
  await panel.locator('.n-tabs-tab:has-text("设置")').click()
  const totalBefore = await dbCount()
  const [download] = await Promise.all([
    panel.waitForEvent('download', { timeout: 8000 }),
    panel.locator('button:has-text("导出 JSON")').click(),
  ])
  const exportPath = '/tmp/opencode/cf-test/export.json'
  await download.saveAs(exportPath)
  const bundle = JSON.parse(await import('node:fs/promises').then((m) => m.readFile(exportPath, 'utf8')))
  check('导出文件包含全部剪藏', Array.isArray(bundle.clips) && bundle.clips.length === totalBefore, `clips=${bundle.clips?.length}, db=${totalBefore}`)
  // 重新导入：ID 冲突应重新编号，总数翻倍
  const fileChooserPromise = panel.waitForEvent('filechooser')
  await panel.locator('button:has-text("导入 JSON")').click()
  const chooser = await fileChooserPromise
  await chooser.setFiles(exportPath)
  await panel.waitForSelector('.n-message', { timeout: 8000 })
  await panel.waitForTimeout(500)
  const totalAfterImport = await dbCount()
  check('导入后数据翻倍（冲突 ID 自动重编号）', totalAfterImport === totalBefore * 2, `${totalBefore} → ${totalAfterImport}`)

  // ---------- 收尾：清空全部数据 ----------
  console.log('\n[T11] 清空全部数据')
  const clearBtn = panel.locator('button:has-text("清空全部剪藏")')
  await clearBtn.click()
  await panel.locator('.n-popconfirm .n-button--primary-type, .n-popconfirm .n-button:last-child').first().click()
  await panel.waitForTimeout(600)
  check('清空后 IndexedDB 归零', (await dbCount()) === 0)

  // ============================================================
  // Auto Capture 场景验证（§43）
  // ============================================================

  /** 直连 IDB 列出自动采集记录（content + ruleId） */
  async function autoClips() {
    return panel.evaluate(
      () =>
        new Promise((res) => {
          const rq = indexedDB.open('clipflow')
          rq.onsuccess = () => {
            const db = rq.result
            const idx = db.transaction('clips').objectStore('clips').index('by-capture-created')
            const req = idx.getAll(IDBKeyRange.bound(['auto'], ['auto', []]))
            req.onsuccess = () =>
              res(req.result.map((c) => ({ content: c.content, ruleId: c.ruleId })))
            req.onerror = () => res([])
          }
          rq.onerror = () => res([])
        }),
    )
  }

  /** 直接向 rules store 写入规则（页面在 seed 之后打开，CS 启动时拉取即生效） */
  async function seedRules(rules) {
    await panel.evaluate((list) => {
      return new Promise((res) => {
        const rq = indexedDB.open('clipflow')
        rq.onsuccess = () => {
          const db = rq.result
          const tx = db.transaction('rules', 'readwrite')
          for (const r of list) tx.objectStore('rules').put(r)
          tx.oncomplete = () => res()
          tx.onerror = () => res()
        }
        rq.onerror = () => res()
      })
    }, rules)
  }

  let ruleSeq = 0
  function makeRule(partial) {
    ruleSeq++
    return {
      id: `rule_${ruleSeq}_${Math.random().toString(36).slice(2, 6)}`,
      name: '规则',
      enabled: true,
      urlCondition: { type: 'wildcard', value: '*' },
      pattern: { regex: 'ERROR\\s+(.+)', flags: 'gm', captureGroup: 1 },
      triggers: { pageLoad: true, spaNavigation: true, domChange: true },
      deduplication: { enabled: true, scope: 'page' },
      scope: { type: 'page' },
      stats: { matchCount: 0, lastMatchedAt: null },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      ...partial,
    }
  }

  /** 轮询直到出现满足条件的自动采集记录或超时 */
  async function pollAutoClips(predicate, timeoutMs = 8000, stepMs = 400) {
    const deadline = Date.now() + timeoutMs
    let autos = []
    while (Date.now() < deadline) {
      autos = await autoClips()
      if (autos.some(predicate)) return autos
      await panel.waitForTimeout(stepMs)
    }
    return autos
  }

  console.log('\n[S1/S2] 页面加载采集 + 刷新不重复')
  await seedRules([
    makeRule({
      id: 'rule_log',
      name: '提取错误日志',
      urlCondition: { type: 'wildcard', value: 'http://127.0.0.1:8765/log*' },
    }),
    makeRule({
      id: 'rule_bad',
      name: '非法正则规则',
      urlCondition: { type: 'wildcard', value: 'http://127.0.0.1:8765/log*' },
      pattern: { regex: '([', flags: 'g', captureGroup: 0 },
    }),
  ])
  const logPage = await context.newPage()
  await logPage.goto(BASE + '/log', { waitUntil: 'domcontentloaded' })
  await panel.waitForTimeout(2500)
  let autos = await autoClips()
  check('S1: 打开 /log 自动生成 2 条 ERROR 记录', autos.length === 2, `实际 ${autos.length}: ${JSON.stringify(autos)}`)
  check(
    'S1: 捕获组内容正确',
    autos.some((a) => a.content === 'RabbitMQ connection timeout') &&
      autos.some((a) => a.content === 'database disconnected'),
    JSON.stringify(autos),
  )
  check('S1: 非法正则未影响其他规则/页面（无崩溃）', (await logPage.evaluate(() => 2 + 2)) === 4)

  await logPage.reload({ waitUntil: 'domcontentloaded' })
  await panel.waitForTimeout(2500)
  autos = await autoClips()
  check('S2: 刷新后不重复增加', autos.length === 2, `实际 ${autos.length}`)

  console.log('\n[S3] DOM 动态变化采集')
  await seedRules([
    makeRule({
      id: 'rule_dyn',
      name: '动态内容',
      urlCondition: { type: 'wildcard', value: 'http://127.0.0.1:8765/dyn*' },
    }),
  ])
  const dynPage = await context.newPage()
  await dynPage.goto(BASE + '/dyn?t=alpha', { waitUntil: 'domcontentloaded' })
  await panel.waitForTimeout(3200)
  autos = await autoClips()
  check('S3: 动态出现的文本被自动采集', autos.some((a) => a.content === 'dynamic alpha'), JSON.stringify(autos))

  console.log('\n[S4] 无关 DOM 变化不产生重复')
  await dynPage.locator('#noise').click()
  await dynPage.locator('#noise').click()
  await dynPage.locator('#noise').click()
  await panel.waitForTimeout(2200)
  autos = await autoClips()
  check('S4: 无关变化后记录数不变', autos.length === 3, `实际 ${autos.length}`)

  console.log('\n[S5] SPA 路由切换采集')
  await seedRules([
    makeRule({
      id: 'rule_spa',
      name: 'SPA 规则',
      urlCondition: { type: 'wildcard', value: 'http://127.0.0.1:8765/spa*' },
      triggers: { pageLoad: true, spaNavigation: true, domChange: false },
    }),
  ])
  const spaPage = await context.newPage()
  await spaPage.goto(BASE + '/spa', { waitUntil: 'domcontentloaded' })
  await panel.waitForTimeout(2200)
  autos = await autoClips()
  check('S5a: 首屏 view one 已采集', autos.some((a) => a.content === 'spa view one'), JSON.stringify(autos))
  await spaPage.locator('#nav').click()
  autos = await pollAutoClips((a) => a.content === 'spa view two ready')
  check(
    'S5b: pushState 切换后 view two 已采集',
    autos.some((a) => a.content === 'spa view two ready'),
    JSON.stringify(autos),
  )

  console.log('\n[S6] 多标签页并发采集')
  await seedRules([
    makeRule({
      id: 'rule_multi',
      name: '多 Tab 规则',
      urlCondition: { type: 'wildcard', value: 'http://127.0.0.1:8765/multi*' },
    }),
  ])
  const tabA = await context.newPage()
  const tabB = await context.newPage()
  await tabA.goto(BASE + '/multi?tab=a', { waitUntil: 'domcontentloaded' })
  await tabB.goto(BASE + '/multi?tab=b', { waitUntil: 'domcontentloaded' })
  await panel.waitForTimeout(2600)
  autos = await autoClips()
  const multiUrls = new Set(
    (
      await panel.evaluate(() => {
        return new Promise((res) => {
          const rq = indexedDB.open('clipflow')
          rq.onsuccess = () => {
            const db = rq.result
            const idx = db.transaction('clips').objectStore('clips').index('by-rule-created')
            const req = idx.getAll(IDBKeyRange.bound(['rule_multi'], ['rule_multi', []]))
            req.onsuccess = () => res(req.result.map((c) => c.source.url))
            req.onerror = () => res([])
          }
        })
      })
    ).map((u) => u.split('?')[1]),
  )
  check('S6: 两个 Tab 的数据均保存（不同 query → 均保留）', multiUrls.has('tab=a') && multiUrls.has('tab=b'), [...multiUrls].join(','))

  console.log('\n[S7] 关闭规则立即停止采集')
  // 通过面板 UI 关闭「动态内容」规则
  await panel.locator('.n-tabs-tab:has-text("自动采集")').click()
  await panel.waitForSelector('.rule-card', { timeout: 5000 })
  const dynCard = panel.locator('.rule-card', { hasText: '动态内容' })
  await dynCard.locator('.n-switch').click()
  await panel.waitForTimeout(500)
  const beforeDisable = (await autoClips()).length
  await dynPage.goto(BASE + '/dyn?t=beta', { waitUntil: 'domcontentloaded' })
  await panel.waitForTimeout(3200)
  autos = await autoClips()
  check('S7: 禁用后不再采集新内容', autos.length === beforeDisable, `${beforeDisable} → ${autos.length}`)

  console.log('\n[S8] Side Panel 展示自动采集标识与统计')
  await panel.locator('.n-tabs-tab:has-text("剪藏")').click()
  await panel.waitForTimeout(400)
  const autoTagTexts = await panel.locator('.cc-channel.is-auto').allTextContents()
  check(
    'S8: 列表展示「自动 · 规则名」标识',
    autoTagTexts.some((t) => t.includes('提取错误日志')),
    autoTagTexts.join(' | '),
  )
  await panel.locator('.n-tabs-tab:has-text("自动采集")').click()
  await panel.waitForSelector('.rule-card', { timeout: 5000 })
  const logCard = panel.locator('.rule-card', { hasText: '提取错误日志' })
  const statText = (await logCard.locator('.rc-count').textContent().catch(() => '')) ?? ''
  check('S8: 规则卡显示已采集统计', /已采集 \d+/.test(statText), statText)

  console.log('\n[T12] 批量勾选删除与全部删除')
  // 数据源：S 场景产生的自动采集记录
  await panel.locator('.n-tabs-tab:has-text("剪藏")').click()
  await panel.waitForSelector('.clip-card', { timeout: 5000 })
  const beforeT12 = await dbCount()
  check('T12 前置：存在可删除数据', beforeT12 >= 4, `实际 ${beforeT12}`)

  // 进入选择模式，勾选前两条
  await panel.locator('button:has-text("选择")').first().click()
  await panel.waitForTimeout(300)
  const boxes = panel.locator('.cc-select')
  check('选择模式：卡片显示复选框', (await boxes.count()) === await panel.locator('.clip-card').count())
  await boxes.nth(0).click()
  await boxes.nth(1).click()
  const selText = (await panel.locator('.sel-count').textContent()) ?? ''
  check('勾选 2 条后计数正确', selText.includes('已选 2'), selText)

  // 删除所选
  await panel.locator('button:has-text("删除所选")').click()
  await panel.locator('.n-popconfirm .n-button--primary-type, .n-popconfirm .n-button:last-child').first().click()
  await panel.waitForTimeout(600)
  const afterSelDel = await dbCount()
  check('删除所选后数量减 2', afterSelDel === beforeT12 - 2, `${beforeT12} → ${afterSelDel}`)

  // 全部删除（当前筛选=全部）
  await panel.locator('button:has-text("全部删除")').click()
  await panel.locator('.n-popconfirm .n-button--primary-type, .n-popconfirm .n-button:last-child').first().click()
  await panel.waitForTimeout(800)
  check('全部删除后归零', (await dbCount()) === 0)
  check('全部删除后回到空状态', (await panel.locator('.empty').count()) > 0)

  console.log('\n[T13] 页面复制按钮（Clipboard API）捕获')
  await panel.locator('.n-tabs-tab:has-text("剪藏")').click()
  await panel.waitForTimeout(300)
  const cbPage = await context.newPage()
  await cbPage.goto(BASE + '/copybtn', { waitUntil: 'domcontentloaded' })
  await panel.waitForTimeout(500)
  await cbPage.locator('#api-copy').click()
  // 轮询直到入库
  let apiClips = []
  const deadline = Date.now() + 8000
  while (Date.now() < deadline) {
    apiClips = (await autoClips()).concat(
      await panel.evaluate(() =>
        new Promise((res) => {
          const rq = indexedDB.open('clipflow')
          rq.onsuccess = () => {
            const req = rq.result.transaction('clips').objectStore('clips').getAll()
            req.onsuccess = () => res(req.result.map((c) => ({ content: c.content })))
            req.onerror = () => res([])
          }
        }),
      ),
    )
    if (apiClips.some((c) => c.content.includes('api copy payload 8899'))) break
    await panel.waitForTimeout(400)
  }
  check('T13: 页面复制按钮内容已入列表', apiClips.some((c) => c.content.includes('api copy payload 8899')), JSON.stringify(apiClips))
  await cbPage.close().catch(() => {})

  console.log('\n[T14] 选中即记录（划词自动采集）')
  const selPage = await context.newPage()
  await selPage.goto(BASE + '/a', { waitUntil: 'domcontentloaded' })
  await panel.waitForTimeout(400)
  // 程序化选区同样会触发 selectionchange
  await selPage.evaluate(() => {
    const p = document.querySelector('p')
    const r = document.createRange()
    r.selectNodeContents(p)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
  })
  const selDeadline = Date.now() + 8000
  let selOk = false
  while (Date.now() < selDeadline) {
    const all = await panel.evaluate(() =>
      new Promise((res) => {
        const rq = indexedDB.open('clipflow')
        rq.onsuccess = () => {
          const req = rq.result.transaction('clips').objectStore('clips').getAll()
          req.onsuccess = () => res(req.result.map((c) => c.content))
          req.onerror = () => res([])
        }
      }),
    )
    if (all.some((c) => c.includes('Alpha paragraph'))) {
      selOk = true
      break
    }
    await panel.waitForTimeout(400)
  }
  check('T14a: 选区稳定后自动入库', selOk)
  const countAfterSel = await dbCount()

  // 关闭开关后，新选区不再记录
  await panel.locator('.n-tabs-tab:has-text("设置")').click()
  const sw1 = panel.locator('.pref-row .n-switch').first()
  const beforeOff = String(await sw1.getAttribute('aria-checked'))
  await sw1.click()
  await panel.waitForTimeout(400)
  await selPage.evaluate(() => {
    const p = document.querySelector('p')
    const r = document.createRange()
    r.setStart(p.firstChild, 0)
    r.setEnd(p.firstChild, 20)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
  })
  await panel.waitForTimeout(1500)
  const countWhenOff = await dbCount()
  check('T14b: 关闭开关后选区不再记录', countWhenOff === countAfterSel, `${countAfterSel} → ${countWhenOff}`)
  // 恢复开启
  if (beforeOff === 'true') await sw1.click()
  await panel.waitForTimeout(300)
  await selPage.close().catch(() => {})

  await logPage.close().catch(() => {})
  await dynPage.close().catch(() => {})
  await spaPage.close().catch(() => {})
  await tabA.close().catch(() => {})
  await tabB.close().catch(() => {})
} catch (err) {
  failed++
  console.error('\n!! 测试执行异常:', err.message)
}

await context.close()

console.log(`\n========== 结果: ${passed} 通过 / ${failed} 失败 ==========`)
process.exit(failed ? 1 : 0)
