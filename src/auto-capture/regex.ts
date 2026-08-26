import { ALLOWED_REGEX_FLAGS, MAX_MATCHES_PER_RULE } from './constants'
import type {
  AutoCapturePattern,
  AutoCaptureRule,
  RegexValidation,
  RuleMatch,
} from './types'

/** 校验用户输入的正则与 flags（规则编辑器 / 执行前共用） */
export function validateRegex(regex: string, flags: string): RegexValidation {
  const src = regex ?? ''
  const fl = flags ?? ''
  if (!src.trim()) return { valid: false, error: '正则表达式不能为空' }

  const seen = new Set<string>()
  for (const f of fl) {
    if (!ALLOWED_REGEX_FLAGS.has(f)) {
      return { valid: false, error: `不支持的 flag：“${f}”（仅支持 g i m s u y）` }
    }
    if (seen.has(f)) {
      return { valid: false, error: `重复的 flag：“${f}”` }
    }
    seen.add(f)
  }
  try {
    // 原样编译校验（含 y），执行时才做 g 归一
    new RegExp(src, fl)
    return { valid: true }
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : String(e),
    }
  }
}

/**
 * 执行用 flags：自动确保 g（多条结果全量提取，不因用户漏写 g 只取第一条），
 * 移除 y（sticky 会破坏 exec 循环推进语义）。
 */
function sanitizeFlags(flags: string): string {
  const set = new Set((flags ?? '').split(''))
  set.delete('y')
  set.add('g')
  return [...set].join('')
}

export function compilePattern(pattern: AutoCapturePattern): RegExp {
  return new RegExp(pattern.regex, sanitizeFlags(pattern.flags))
}

/**
 * 对页面文本执行单条规则，返回全部匹配。
 *
 * 保护措施：
 * - 非法正则直接 throw（调用方逐规则隔离捕获）；
 * - 强制 g + zero-length 匹配手动推进 lastIndex，杜绝 exec 死循环；
 * - MAX_MATCHES_PER_RULE 硬上限；
 * - captureGroup 越界时回退为完整匹配。
 */
export function executeRule(
  rule: AutoCaptureRule,
  pageText: string,
): RuleMatch[] {
  const validation = validateRegex(rule.pattern.regex, rule.pattern.flags)
  if (!validation.valid) throw new Error(validation.error)

  const re = compilePattern(rule.pattern)
  const group = Math.max(0, Math.floor(rule.pattern.captureGroup || 0))
  const out: RuleMatch[] = []
  let guard = 0

  let m: RegExpExecArray | null = re.exec(pageText)
  while (m) {
    if (++guard > MAX_MATCHES_PER_RULE) break
    const full = m[0]
    const picked = (group === 0 ? full : (m[group] ?? full)).trim()
    if (picked) {
      out.push({ content: picked, fullMatch: full, index: m.index })
      if (out.length >= MAX_MATCHES_PER_RULE) break
    }
    if (full === '') {
      re.lastIndex += 1
      if (re.lastIndex > pageText.length) break
    }
    m = re.exec(pageText)
  }
  return out
}
