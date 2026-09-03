import { MAX_PAGE_TEXT_LENGTH } from '../../auto-capture/constants'
import { logger } from './logger'

export interface PageText {
  text: string
  truncated: boolean
}

const COPY_VALUE_SELECTOR =
  'textarea, input:not([type="password"]), select'
const COPY_DATA_SELECTOR =
  '[data-magnet], [data-clipboard-text], [data-copy-text], [data-copy-content], [data-copy-value]'

function appendUnique(parts: string[], seen: Set<string>, raw: string): void {
  const value = raw.trim()
  if (!value || seen.has(value)) return
  seen.add(value)
  parts.push(value)
}

/**
 * 组合页面正文与复制组件的实际文本值。
 * innerText 不保证包含 input/textarea 的当前 value，也不会包含 data-* 属性；
 * 这些内容仍可能是用户能直接复制的正文，因此补到同一规则输入中。
 */
export function extractPageText(body: HTMLElement | null): PageText {
  let text = ''
  try {
    text = body?.innerText ?? body?.textContent ?? ''
  } catch {
    // 个别页面 innerText getter 可能抛异常，回退 textContent
    text = body?.textContent ?? ''
  }

  const parts = text ? [text] : []
  const seen = new Set<string>()
  if (text.trim()) seen.add(text.trim())

  try {
    for (const element of body?.querySelectorAll(COPY_VALUE_SELECTOR) ?? []) {
      const control = element as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      if ('type' in control && String(control.type).toLowerCase() === 'password') continue
      if ('value' in control) appendUnique(parts, seen, String(control.value ?? ''))
    }

    for (const element of body?.querySelectorAll(COPY_DATA_SELECTOR) ?? []) {
      for (const name of [
        'data-magnet',
        'data-clipboard-text',
        'data-copy-text',
        'data-copy-content',
        'data-copy-value',
      ]) {
        appendUnique(parts, seen, element.getAttribute(name) ?? '')
      }
    }
  } catch {
    // 页面 DOM 在扫描期间变化时，保留已获取的正文即可
  }

  text = parts.join('\n')
  if (text.length > MAX_PAGE_TEXT_LENGTH) {
    logger.warn(
      `Page text truncated: ${text.length} -> ${MAX_PAGE_TEXT_LENGTH}`,
    )
    return { text: text.slice(0, MAX_PAGE_TEXT_LENGTH), truncated: true }
  }
  return { text, truncated: false }
}

/**
 * 当前版本采集范围：整页可见文本，以及复制控件/复制载荷中的文字。
 *
 * 扩展预留：未来增加“指定区域 / CSS Selector / 元素选择器”时，
 * 只需把本函数改造为按 scope 参数取文（scope 层），规则引擎与调度器零改动。
 */
export function getPageText(): PageText {
  return extractPageText(document.body)
}
