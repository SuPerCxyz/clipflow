import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { Prefs } from '../types'
import { DEFAULT_PREFS } from '../types'
import * as db from '../database/indexeddb'

export const usePrefsStore = defineStore('prefs', () => {
  const prefs = ref<Prefs>({ ...DEFAULT_PREFS })
  const loaded = ref(false)

  async function loadAll(): Promise<void> {
    prefs.value = await db.getPrefs()
    loaded.value = true
  }

  /** 保存并广播给全部 Content Script（选中即记录开关实时生效） */
  async function update(partial: Partial<Prefs>): Promise<void> {
    prefs.value = await db.savePrefs(partial)
    try {
      await chrome.runtime.sendMessage({
        type: 'PREFS_UPDATED',
        prefs: prefs.value,
      })
    } catch {
      /* 无接收方时静默 */
    }
  }

  return { prefs, loaded, loadAll, update }
})
