import type { ContentType } from '../types'

/** 启发式识别复制内容的类型 */
export function detectContentType(text: string): ContentType {
  const s = text.trim()
  if (!s) return 'text'
  if (/^[[{][\s\S]*[\]}]$/.test(s)) {
    try {
      JSON.parse(s)
      return 'json'
    } catch {
      /* 非 JSON，继续判断 */
    }
  }
  if (/^https?:\/\/\S+$/i.test(s)) return 'url'
  if (/(^#{1,6}\s|\n#{1,6}\s|^```|^\s*[-*]\s\[.\]\s)/m.test(s)) return 'markdown'
  if (
    /(=>|function\s+\w+\s*\(|^\s*(const|let|var|def|class|func|public|private)\b|\b(import|from)\s+['"]|[{};]\s*$)/m.test(
      s,
    )
  ) {
    return 'code'
  }
  return 'text'
}

/** 粗略字数统计：CJK 按字符、西文按单词 */
export function countWords(text: string): number {
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length
  const words = (
    text.replace(/[\u4e00-\u9fff]/g, ' ').match(/[A-Za-z0-9_'-]+/g) ?? []
  ).length
  return cjk + words
}
