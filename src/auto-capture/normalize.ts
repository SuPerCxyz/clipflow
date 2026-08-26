/**
 * 采集内容归一化（保守策略）：仅用于生成去重指纹，不改写保存的原文。
 * - CRLF → LF
 * - 连续空格/制表符/不间断空格 → 单空格（“ERROR   timeout” ≡ “ERROR timeout”）
 * - 3 个以上连续换行折叠为空行
 * 不做任何破坏日志/代码结构更激进的变换。
 */
export function normalizeCaptureText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 指纹用的 URL 归一：去掉 hash，保留 origin/path/query（query 变化视为不同页面） */
export function normalizeUrlForFingerprint(url: string): string {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.origin + u.pathname + u.search
  } catch {
    return url
  }
}
