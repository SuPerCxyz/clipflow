import type { AutoCaptureUrlCondition } from './types'

/**
 * 通配符 → 正则。
 * - `*` → 任意字符；
 * - `*.example.com`（星号后紧跟点）按子域语义处理：
 *   裸域名、单级/多级子域均命中，对齐 Chrome match-pattern 直觉。
 */
function wildcardToRegExp(pattern: string): RegExp {
  const SUBDOMAIN_TOKEN = '\u0001'
  const src =
    pattern
      .trim()
      .replace(/\*\./g, SUBDOMAIN_TOKEN)
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(new RegExp(SUBDOMAIN_TOKEN, 'g'), '(?:[^./]+\\.)*')
  return new RegExp(`^${src}$`, 'i')
}

/**
 * 判定 URL 是否命中规则条件。
 * 任何异常（非法正则等）一律返回 false，绝不向上抛出——
 * 单条规则的错误不允许影响 Content Script 或其他规则。
 */
export function matchUrl(
  condition: AutoCaptureUrlCondition | undefined,
  url: string,
): boolean {
  try {
    if (!condition) return false
    if (condition.type === 'all') return /^https?:/i.test(url)
    if (condition.type === 'wildcard') {
      const p = (condition.value ?? '').trim()
      if (!p || p === '*') return /^https?:/i.test(url)
      return wildcardToRegExp(p).test(url)
    }
    if (condition.type === 'regex') {
      if (!(condition.value ?? '').trim()) return false
      return new RegExp(condition.value).test(url)
    }
    return false
  } catch {
    return false
  }
}
