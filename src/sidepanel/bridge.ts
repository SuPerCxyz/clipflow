import type { ClipsChangedMessage } from '../types'
import { useClipsStore } from '../stores/clips'
import { useWorkspaceStore } from '../stores/workspace'

/**
 * 运行时桥：订阅 Service Worker 广播，把数据变化推入 Pinia stores；
 * 同时申请持久化存储配额（降低 IndexedDB 被回收的概率）。
 * 调用时机在 app.use(createPinia()) 之后，可直接使用静态导入。
 */
export async function registerRuntimeBridge(): Promise<void> {
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type !== 'CLIPS_CHANGED') return
    void useClipsStore().handleExternalChange(msg as ClipsChangedMessage)
    void useWorkspaceStore().refreshCurrent()
  })

  try {
    await navigator.storage.persist()
  } catch {
    /* 部分环境不支持，忽略 */
  }
}
