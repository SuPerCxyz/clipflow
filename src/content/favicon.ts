/** 解析页面 favicon 地址（手动捕获与自动采集共用） */
export function resolveFavicon(): string {
  const link = document.querySelector<HTMLLinkElement>(
    'link[rel~="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]',
  )
  if (link?.href) return link.href
  try {
    return new URL('/favicon.ico', location.origin).href
  } catch {
    return ''
  }
}
