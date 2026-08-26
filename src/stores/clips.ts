import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import type { CaptureType, ClipItem, ClipsChangedMessage } from '../types'
import * as db from '../database/indexeddb'
import { tokenize } from '../utils/search'
import { copyText } from '../utils/clipboard'
import { buildPlainText, buildDocument } from '../utils/markdown'
import { useWorkspaceStore } from './workspace'

const PAGE_SIZE = 60
const SEARCH_LIMIT = 300
const SEARCH_DEBOUNCE = 220

export const useClipsStore = defineStore('clips', () => {
  const items = ref<ClipItem[]>([])
  const query = ref('')
  const loading = ref(false)
  const exhausted = ref(false)
  const totalCount = ref(0)

  /** 列表过滤：全部 / 手动复制 / 自动采集（可再按规则过滤） */
  const captureMode = ref<'all' | CaptureType>('all')
  const ruleFilter = ref('')

  function listOpts() {
    return {
      captureType: captureMode.value === 'all' ? undefined : captureMode.value,
      ruleId: captureMode.value === 'auto' && ruleFilter.value ? ruleFilter.value : undefined,
    }
  }

  /** 新记录是否符合当前过滤（决定是否原位插入） */
  function matchesFilter(clip: ClipItem): boolean {
    if (captureMode.value !== 'all' && clip.captureType !== captureMode.value) return false
    if (captureMode.value === 'auto' && ruleFilter.value && clip.ruleId !== ruleFilter.value) return false
    return true
  }

  const isSearching = computed(() => query.value.trim().length > 0)
  let timer: ReturnType<typeof setTimeout> | undefined

  async function reloadFirstPage(): Promise<void> {
    const page = await db.listClips({ limit: PAGE_SIZE, ...listOpts() })
    items.value = page
    exhausted.value = page.length < PAGE_SIZE
  }

  async function loadMore(): Promise<void> {
    if (loading.value || exhausted.value || isSearching.value) return
    const oldest = items.value.at(-1)
    if (!oldest) return
    loading.value = true
    try {
      const older = await db.listClips({
        limit: PAGE_SIZE,
        before: [oldest.createdAt, oldest.id],
        ...listOpts(),
      })
      items.value.push(...older)
      exhausted.value = older.length < PAGE_SIZE
    } finally {
      loading.value = false
    }
  }

  async function runSearch(): Promise<void> {
    const tokens = tokenize(query.value)
    if (!tokens.length) {
      await reloadFirstPage()
      return
    }
    loading.value = true
    try {
      items.value = await db.searchClips(tokens, { limit: SEARCH_LIMIT, ...listOpts() })
    } finally {
      loading.value = false
    }
    exhausted.value = true
  }

  function scheduleSearch(): void {
    clearTimeout(timer)
    timer = setTimeout(() => void runSearch(), SEARCH_DEBOUNCE)
  }

  watch([captureMode, ruleFilter], () => {
    void runSearch()
  })

  async function init(): Promise<void> {
    loading.value = true
    try {
      totalCount.value = await db.countClips()
      if (isSearching.value) await runSearch()
      else await reloadFirstPage()
    } finally {
      loading.value = false
    }
  }

  /** 响应 Service Worker 广播：新增时原位插入，其余情况整页刷新 */
  async function handleExternalChange(msg: ClipsChangedMessage): Promise<void> {
    if (msg.reason === 'added' && msg.ids?.length) {
      totalCount.value += msg.ids.length
      if (isSearching.value) return
      for (const id of msg.ids) {
        const clip = await db.getClip(id)
        if (!clip || !matchesFilter(clip) || items.value.some((i) => i.id === clip.id)) continue
        items.value.unshift(clip)
        if (items.value.length > PAGE_SIZE) items.value.pop()
      }
      return
    }
    await init()
  }

  async function remove(id: string): Promise<void> {
    await db.deleteClip(id)
    items.value = items.value.filter((i) => i.id !== id)
    totalCount.value = Math.max(0, totalCount.value - 1)
    useWorkspaceStore().pruneClip(id)
  }

  /** 批量删除勾选项 */
  async function removeMany(ids: string[]): Promise<number> {
    if (!ids.length) return 0
    await db.deleteClips(ids)
    const idSet = new Set(ids)
    items.value = items.value.filter((i) => !idSet.has(i.id))
    totalCount.value = Math.max(0, totalCount.value - ids.length)
    const ws = useWorkspaceStore()
    for (const id of ids) ws.pruneClip(id)
    return ids.length
  }

  /**
   * 删除当前筛选下的全部记录。
   * 搜索态：删除范围 = 当前搜索结果集；否则按通道/规则过滤全量删除。
   */
  async function removeAllFiltered(): Promise<number> {
    if (isSearching.value) {
      return removeMany(items.value.map((i) => i.id))
    }
    const ids = await db.deleteAllClips(listOpts())
    await reloadFirstPage()
    totalCount.value = await db.countClips()
    const ws = useWorkspaceStore()
    for (const id of ids) ws.pruneClip(id)
    return ids.length
  }

  async function updateContent(id: string, content: string): Promise<void> {
    const next = await db.updateClipContent(id, content)
    if (!next) return
    const idx = items.value.findIndex((i) => i.id === id)
    if (idx >= 0) items.value[idx] = next
  }

  async function copyOne(id: string): Promise<boolean> {
    const clip = items.value.find((i) => i.id === id)
    return clip ? copyText(clip.content) : false
  }

  /** 合并复制当前结果集（搜索态为搜索结果，否则为最近剪藏）：纯内容，无附加信息 */
  async function copyAll(): Promise<boolean> {
    if (!items.value.length) return false
    return copyText(buildPlainText(items.value))
  }

  /** 详情复制：Markdown 格式，含文档头与每条来源信息 */
  async function copyAllDetailed(): Promise<boolean> {
    if (!items.value.length) return false
    const title = isSearching.value ? 'ClipFlow 搜索结果' : 'ClipFlow Collection'
    return copyText(buildDocument({ title, clips: items.value }))
  }

  return {
    items,
    query,
    loading,
    exhausted,
    totalCount,
    isSearching,
    captureMode,
    ruleFilter,
    init,
    loadMore,
    scheduleSearch,
    runSearch,
    handleExternalChange,
    remove,
    removeMany,
    removeAllFiltered,
    updateContent,
    copyOne,
    copyAll,
    copyAllDetailed,
  }
})
