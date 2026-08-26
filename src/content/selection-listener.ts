/**
 * Selection Capture：选区稳定后自动记录（覆盖浏览器“划词自动复制”等
 * 不产生 copy 事件的场景）。
 *
 * - selectionchange 防抖 SELECTION_DEBOUNCE_MS，避免拖拽选择期间反复触发；
 * - 最短 SELECTION_MIN_LENGTH 字符，过滤双击取词等噪声；
 * - 与手动 Ctrl+C 共用 captureContent 的连续去重：
 *   选中已记录后紧接 Ctrl+C 不会产生重复条目；
 * - 可在设置页关闭（PREFS_UPDATED 实时生效，默认开启）。
 */
import { SELECTION_DEBOUNCE_MS, SELECTION_MIN_LENGTH } from '../auto-capture/constants'
import { logger } from './auto-capture/logger'
import { captureContent } from './copy-listener'

let enabled = true
let timer: ReturnType<typeof setTimeout> | undefined

async function loadPref(): Promise<void> {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_PREFS' })
    enabled = Boolean(res?.prefs?.selectionAutoCapture ?? true)
    logger.debug('selection capture pref:', enabled)
  } catch {
    /* 拉取失败保持默认开启 */
  }
}

export function registerSelectionCapture(): void {
  void loadPref()

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'PREFS_UPDATED') return false
    enabled = Boolean(msg.prefs?.selectionAutoCapture ?? true)
    if (!enabled) clearTimeout(timer)
    return false
  })

  document.addEventListener(
    'selectionchange',
    () => {
      if (!enabled) return
      clearTimeout(timer)
      timer = setTimeout(() => {
        const text = String(document.getSelection() ?? '')
        if (text.replace(/\s/g, '').length < SELECTION_MIN_LENGTH) return
        captureContent(text)
      }, SELECTION_DEBOUNCE_MS)
    },
    true,
  )
}
