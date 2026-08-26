import type {
  AutoCaptureRule,
  AutoCaptureScanPayload,
  RawAutoMatch,
  TestRuleResult,
} from '../../auto-capture/types'
import { MAX_MATCHES_PER_SCAN } from '../../auto-capture/constants'
import { executeRule } from '../../auto-capture/regex'
import { matchUrl } from '../../auto-capture/url-matcher'
import { getPageText } from './page-text'
import { logger } from './logger'
import { createScheduler, type ScanReason } from './scheduler'
import { watchSpaNavigation } from './spa-listener'
import { watchDomMutations } from './mutation-listener'
import { resolveFavicon } from '../favicon'

/** 当前页面的启用规则缓存（由 Service Worker 下发，RULES_UPDATED 增量刷新） */
let enabledRules: AutoCaptureRule[] = []

type TriggerKey = 'pageLoad' | 'spaNavigation' | 'domChange'
const REASON_TRIGGER: Record<ScanReason, TriggerKey> = {
  'page-load': 'pageLoad',
  'spa-navigation': 'spaNavigation',
  'dom-change': 'domChange',
}

async function refreshRules(): Promise<void> {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_AUTO_RULES' })
    enabledRules = Array.isArray(res?.rules) ? (res.rules as AutoCaptureRule[]) : []
    logger.debug(`rules cache updated: ${enabledRules.length} enabled`)
  } catch (err) {
    logger.warn('failed to load rules:', err)
    enabledRules = []
  }
}

// ---------- 扫描执行（§38 内部流程） ----------

const scheduler = createScheduler(async (reasons) => {
  await scan(reasons)
})

async function scan(reasons: ScanReason[]): Promise<void> {
  if (!enabledRules.length) return
  const url = location.href
  // 合并后的原因集合取触发键并集：任一原因启用的规则都参与本次扫描
  const triggerKeys = new Set(reasons.map((r) => REASON_TRIGGER[r]))

  const rules = enabledRules.filter(
    (r) =>
      r.enabled !== false &&
      [...triggerKeys].some((k) => r.triggers?.[k] === true) &&
      matchUrl(r.urlCondition, url),
  )
  if (!rules.length) return

  const started = performance.now()
  const { text } = getPageText()
  if (!text.trim()) return

  const matches: RawAutoMatch[] = []
  for (const rule of rules) {
    if (matches.length >= MAX_MATCHES_PER_SCAN) break
    try {
      // 每条规则独立执行：单规则异常不影响其他规则
      for (const m of executeRule(rule, text)) {
        matches.push({ ruleId: rule.id, content: m.content, index: m.index })
        if (matches.length >= MAX_MATCHES_PER_SCAN) break
      }
    } catch (err) {
      logger.warn(`rule "${rule.name}" failed:`, err)
    }
  }

  const durationMs = Math.round(performance.now() - started)
  logger.debug({
    reasons,
    rules: rules.length,
    pageChars: text.length,
    matches: matches.length,
    durationMs: `${durationMs}ms`,
  })
  if (!matches.length) return

  const payload: AutoCaptureScanPayload = {
    url,
    title: document.title || '',
    favicon: resolveFavicon(),
    capturedAt: Date.now(),
    matches,
  }
  try {
    await chrome.runtime.sendMessage({ type: 'AUTO_CAPTURE_MATCHES', payload })
  } catch (err) {
    logger.warn('report matches failed:', err)
  }
}

// ---------- 规则测试器（Side Panel → 当前 Tab） ----------

async function handleTest(rule: AutoCaptureRule): Promise<TestRuleResult> {
  const url = location.href
  try {
    if (!matchUrl(rule.urlCondition, url)) {
      return { ok: false, reason: 'url-mismatch', url }
    }
    const { text } = getPageText()
    if (!text.trim()) return { ok: false, reason: 'no-text', url }

    const started = performance.now()
    const all = executeRule(rule, text)
    const durationMs = Math.round(performance.now() - started)
    return {
      ok: true,
      url,
      charCount: text.length,
      durationMs,
      totalMatches: all.length,
      matches: all.slice(0, 50),
    }
  } catch (err) {
    return {
      ok: false,
      reason: 'invalid-regex',
      url,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ---------- 启动 ----------

export function initAutoCapture(): void {
  void refreshRules()

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'RULES_UPDATED') {
      enabledRules = Array.isArray(msg.rules) ? msg.rules : []
      logger.debug(`rules pushed: ${enabledRules.length} enabled`)
      sendResponse({ ok: true })
      return false
    }
    if (msg?.type === 'TEST_AUTO_RULE') {
      void handleTest(msg.rule).then(sendResponse)
      return true // 异步应答
    }
    return false
  })

  // 页面加载 / 刷新（CS 重新注入即触发；重复内容由指纹去重拦截）
  const start = (): void => scheduler.schedule('page-load')
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true })
  } else {
    start()
  }

  watchSpaNavigation(() => scheduler.schedule('spa-navigation'))
  watchDomMutations(() => {
    // 无 domChange 规则时零开销跳过，避免高频 Mutation 白白重置防抖计时器
    if (enabledRules.some((r) => r.enabled && r.triggers?.domChange)) {
      scheduler.schedule('dom-change')
    }
  })

  logger.debug('auto capture initialized')
}
