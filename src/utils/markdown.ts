import MarkdownIt from 'markdown-it'
import dayjs from 'dayjs'
import type { ClipItem } from '../types'
import { domainOf } from './format'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

export function renderMarkdown(src: string): string {
  return md.render(src)
}

function clipSection(clip: ClipItem): string {
  const title = clip.source.title || domainOf(clip.source.url)
  return [
    '## 来源',
    `**${title}**`,
    '',
    `<${clip.source.url}>`,
    '',
    clip.content,
    '',
    '---',
    '',
  ].join('\n')
}

/** 按当前排序生成 Markdown 合并文档（Markdown 文件导出等归档场景使用） */
export function buildDocument(opts: { title?: string; clips: ClipItem[] }): string {
  const title = opts.title || 'ClipFlow Collection'
  if (!opts.clips.length) return `# ${title}\n\n> 暂无内容\n`
  const head =
    `# ${title}\n\n` +
    `> 由 ClipFlow 生成 · ${dayjs().format('YYYY-MM-DD HH:mm')} · 共 ${opts.clips.length} 条\n\n`
  return head + opts.clips.map(clipSection).join('\n')
}

/**
 * 纯净合并：仅拼接原始内容本身，不附加任何标题 / 来源 / 分隔标记。
 * 条目之间以单个空行分隔，供「复制全部」写入系统剪贴板。
 */
export function buildPlainText(clips: ClipItem[]): string {
  return clips.map((c) => c.content).join('\n\n')
}
