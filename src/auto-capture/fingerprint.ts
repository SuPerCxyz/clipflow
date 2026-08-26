import type { DedupScope } from './types'
import { normalizeUrlForFingerprint } from './normalize'

const encoder = new TextEncoder()

/**
 * 采集指纹 = SHA-256(ruleId + 归一URL? + 归一内容)。
 * - scope=page   ：rule + URL + content，同页刷新/SPA 来回不重复
 * - scope=global ：rule + content，跨 URL 也只存一次
 */
export async function createCaptureFingerprint(input: {
  ruleId: string
  url: string
  /** 必须已经过 normalizeCaptureText 的内容 */
  content: string
  scope: DedupScope
}): Promise<string> {
  const base =
    input.scope === 'global'
      ? `${input.ruleId}\u0000${input.content}`
      : `${input.ruleId}\u0000${normalizeUrlForFingerprint(input.url)}\u0000${input.content}`
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(base))
  let hex = ''
  for (const b of new Uint8Array(digest)) hex += b.toString(16).padStart(2, '0')
  return hex
}
