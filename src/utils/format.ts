import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import 'dayjs/locale/zh-cn'

dayjs.extend(relativeTime)
dayjs.locale('zh-cn')

export function timeAgo(ts: number): string {
  return dayjs(ts).fromNow()
}

export function fullTime(ts: number): string {
  return dayjs(ts).format('YYYY-MM-DD HH:mm:ss')
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.slice(0, 40) || '未知来源'
  }
}

/** 通过 Chrome 内置 _favicon 服务取站点图标，避免跨域与防盗链问题 */
export function faviconSrc(pageUrl: string): string {
  return chrome.runtime.getURL(`_favicon/?pageUrl=${encodeURIComponent(pageUrl)}&size=32`)
}
