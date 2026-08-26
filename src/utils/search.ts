import type { ClipItem } from '../types'

export interface SearchHit {
  item: ClipItem
  score: number
}

export interface HighlightPart {
  text: string
  hit: boolean
}

/** 将查询拆分为小写 token（空格分隔，多 token 为 AND 关系） */
export function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

/** 匹配打分：标题 > URL > 正文；任一 token 全字段未命中即淘汰。返回 0 表示不匹配 */
export function matchClip(item: ClipItem, tokens: string[]): number {
  if (!tokens.length) return 0
  const title = (item.source.title ?? '').toLowerCase()
  const url = item.source.url.toLowerCase()
  const content = item.content.toLowerCase()
  let score = 0
  for (const t of tokens) {
    const inTitle = title.includes(t)
    const inUrl = url.includes(t)
    const inContent = content.includes(t)
    if (!inTitle && !inUrl && !inContent) return 0
    score += (inTitle ? 30 : 0) + (inUrl ? 10 : 0) + (inContent ? 6 : 0)
  }
  return score
}

/**
 * 文本高亮切分：返回按 token 命中位置切开的片段，
 * 由组件层渲染 <mark>，避免 v-html 注入风险。
 */
export function highlight(text: string, tokens: string[]): HighlightPart[] {
  if (!tokens.length || !text) return [{ text, hit: false }]
  const lower = text.toLowerCase()
  const marks = new Array<boolean>(text.length).fill(false)
  for (const t of tokens) {
    let idx = lower.indexOf(t)
    while (idx !== -1) {
      for (let k = idx; k < idx + t.length && k < marks.length; k++) marks[k] = true
      idx = lower.indexOf(t, idx + t.length)
    }
  }
  const parts: HighlightPart[] = []
  let buf = ''
  let hit = marks[0] ?? false
  for (let i = 0; i < text.length; i++) {
    if (marks[i] === hit) {
      buf += text[i]
    } else {
      parts.push({ text: buf, hit })
      buf = text[i]
      hit = marks[i]
    }
  }
  if (buf) parts.push({ text: buf, hit })
  return parts
}
