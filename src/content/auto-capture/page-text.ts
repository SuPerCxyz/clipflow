import { MAX_PAGE_TEXT_LENGTH } from '../../auto-capture/constants'
import { logger } from './logger'

export interface PageText {
  text: string
  truncated: boolean
}

/**
 * 当前版本采集范围：整页可见文本（innerText，天然排除 script/style）。
 *
 * 扩展预留：未来增加“指定区域 / CSS Selector / 元素选择器”时，
 * 只需把本函数改造为按 scope 参数取文（scope 层），规则引擎与调度器零改动。
 */
export function getPageText(): PageText {
  let text = ''
  try {
    text =
      document.body?.innerText ?? document.body?.textContent ?? ''
  } catch {
    // 个别页面 innerText getter 可能抛异常，回退 textContent
    text = document.body?.textContent ?? ''
  }
  if (text.length > MAX_PAGE_TEXT_LENGTH) {
    logger.warn(
      `Page text truncated: ${text.length} -> ${MAX_PAGE_TEXT_LENGTH}`,
    )
    return { text: text.slice(0, MAX_PAGE_TEXT_LENGTH), truncated: true }
  }
  return { text, truncated: false }
}
