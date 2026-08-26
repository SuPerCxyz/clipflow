/**
 * SPA 路由监听（隔离世界侧）。
 *
 * - pushState / replaceState 无法在隔离世界包装（页面对象不可见），
 *   由 MAIN 世界桥 content-main.js 包装后派发 `clipflow:spa-navigate` 事件；
 * - popstate / hashchange 是浏览器生成的事件，两个世界都可监听，直接绑定。
 * notify 内部以 lastUrl 去重，多来源触发不会重复调度。
 */
const BRIDGE_EVENT = 'clipflow:spa-navigate'

export function watchSpaNavigation(onNavigate: () => void): () => void {
  let lastUrl = location.href

  const notify = (): void => {
    if (location.href === lastUrl) return
    lastUrl = location.href
    try {
      onNavigate()
    } catch {
      /* 通知失败不影响宿主页面 */
    }
  }

  window.addEventListener(BRIDGE_EVENT, notify)
  window.addEventListener('popstate', notify)
  window.addEventListener('hashchange', notify)

  return () => {
    window.removeEventListener(BRIDGE_EVENT, notify)
    window.removeEventListener('popstate', notify)
    window.removeEventListener('hashchange', notify)
  }
}
