/**
 * DOM 动态变化监听。回调只做“请求调度”这一件事，
 * 防抖与并发控制全部由 Scheduler 负责——绝不在 Mutation 回调里直接扫描。
 */
export function watchDomMutations(onActivity: () => void): () => void {
  const target = document.body ?? document.documentElement
  if (!target || typeof MutationObserver === 'undefined') return () => {}

  const observer = new MutationObserver((mutations) => {
    if (mutations.length) onActivity()
  })
  observer.observe(target, {
    childList: true,
    subtree: true,
    characterData: true,
  })
  return () => observer.disconnect()
}
