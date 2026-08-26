import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ClipItem, Collection } from '../types'
import * as db from '../database/indexeddb'
import { renderMarkdown, buildDocument, buildPlainText } from '../utils/markdown'
import { copyText } from '../utils/clipboard'

const ACTIVE_KEY = 'clipflow.activeCollection'

function blankCollection(title: string): Omit<Collection, 'id'> {
  return {
    title,
    clips: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tags: [],
    ai: null,
  }
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const collections = ref<Collection[]>([])
  const activeId = ref('')
  const clips = ref<ClipItem[]>([])
  const ready = ref(false)
  const previewMode = ref(false)

  const active = computed(
    () => collections.value.find((c) => c.id === activeId.value) ?? null,
  )

  const previewHtml = computed(() =>
    previewMode.value && active.value
      ? renderMarkdown(buildDocument({ title: active.value.title, clips: clips.value }))
      : '',
  )

  async function persistActive(): Promise<void> {
    const col = active.value
    if (!col) return
    const saved = await db.saveCollection({ ...col })
    Object.assign(col, saved)
    collections.value = [...collections.value]
  }

  async function refreshCurrent(): Promise<void> {
    const col = active.value
    if (!col) {
      clips.value = []
      return
    }
    const list = await Promise.all(col.clips.map((id) => db.getClip(id)))
    clips.value = list.filter((c): c is ClipItem => Boolean(c))
  }

  async function loadAll(): Promise<void> {
    let list = await db.listCollections()
    if (!list.length) {
      const first = await db.saveCollection(blankCollection('默认工作台'))
      list = [first]
    }
    collections.value = list
    const saved = localStorage.getItem(ACTIVE_KEY)
    const target =
      (saved && list.find((c) => c.id === saved)?.id) ?? list[0].id
    await select(target)
    ready.value = true
  }

  async function select(id: string): Promise<void> {
    activeId.value = id
    localStorage.setItem(ACTIVE_KEY, id)
    await refreshCurrent()
  }

  async function create(title: string): Promise<Collection> {
    const col = await db.saveCollection(blankCollection(title.trim() || '未命名工作台'))
    collections.value.unshift(col)
    await select(col.id)
    return col
  }

  async function rename(id: string, title: string): Promise<void> {
    const col = collections.value.find((c) => c.id === id)
    if (!col || !title.trim()) return
    const next = await db.saveCollection({ ...col, title: title.trim() })
    Object.assign(col, next)
    collections.value = [...collections.value]
  }

  async function removeCollection(id: string): Promise<void> {
    await db.deleteCollection(id)
    collections.value = collections.value.filter((c) => c.id !== id)
    if (activeId.value !== id) return
    const fallback = collections.value[0]?.id ?? ''
    if (fallback) await select(fallback)
    else {
      activeId.value = ''
      clips.value = []
    }
  }

  /** 加入工作台（尾部追加，幂等） */
  async function addClip(clipId: string): Promise<'added' | 'exists'> {
    const col = active.value
    if (!col || !clipId) return 'exists'
    if (col.clips.includes(clipId)) return 'exists'
    col.clips.push(clipId)
    await persistActive()
    const clip = await db.getClip(clipId)
    if (clip) clips.value.push(clip)
    return 'added'
  }

  async function removeAt(index: number): Promise<void> {
    const col = active.value
    if (!col || index < 0 || index >= col.clips.length) return
    col.clips.splice(index, 1)
    clips.value.splice(index, 1)
    await persistActive()
  }

  /** 拖拽排序：from 位置移动到 to 位置 */
  async function move(from: number, to: number): Promise<void> {
    const col = active.value
    if (!col || from === to) return
    if (
      from < 0 ||
      to < 0 ||
      from >= col.clips.length ||
      to >= col.clips.length
    )
      return
    const ids = [...col.clips]
    const [movedId] = ids.splice(from, 1)
    ids.splice(to, 0, movedId)
    col.clips = ids

    const arr = [...clips.value]
    const [moved] = arr.splice(from, 1)
    arr.splice(to, 0, moved)
    clips.value = arr
    await persistActive()
  }

  async function clear(): Promise<void> {
    const col = active.value
    if (!col || !col.clips.length) return
    col.clips = []
    clips.value = []
    await persistActive()
  }

  /** 一键合并：按当前排序以纯内容写入系统剪贴板（纯净导出，无附加信息） */
  async function copyMerged(): Promise<boolean> {
    if (!active.value || !clips.value.length) return false
    return copyText(buildPlainText(clips.value))
  }

  /** 详情复制：以工作台标题生成 Markdown（与预览格式一致） */
  async function copyMergedDetailed(): Promise<boolean> {
    if (!active.value || !clips.value.length) return false
    return copyText(
      buildDocument({ title: active.value.title, clips: clips.value }),
    )
  }

  /** 剪藏被删除时，从所有工作台中同步移除引用 */
  function pruneClip(clipId: string): void {
    clips.value = clips.value.filter((c) => c.id !== clipId)
    for (const col of collections.value) {
      if (col.clips.includes(clipId)) {
        col.clips = col.clips.filter((id) => id !== clipId)
        void db.saveCollection({ ...col })
      }
    }
  }

  return {
    collections,
    activeId,
    clips,
    ready,
    previewMode,
    active,
    previewHtml,
    loadAll,
    select,
    create,
    rename,
    removeCollection,
    refreshCurrent,
    addClip,
    removeAt,
    move,
    clear,
    copyMerged,
    copyMergedDetailed,
    pruneClip,
  }
})
