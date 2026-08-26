import { openDB } from 'idb'
import type { DBSchema, IDBPDatabase } from 'idb'
import type {
  AutoCaptureRule,
  AutoCaptureScanPayload,
  CapturePayload,
  CaptureType,
  ClipItem,
  Collection,
  ExportBundle,
  Prefs,
} from '../types'
import { DEFAULT_PREFS } from '../types'
import { genId } from '../utils/id'
import { countWords, detectContentType } from '../utils/detect'
import { matchClip } from '../utils/search'
import {
  normalizeCaptureText,
} from '../auto-capture/normalize'
import { createCaptureFingerprint } from '../auto-capture/fingerprint'

const DB_NAME = 'clipflow'
const DB_VERSION = 3
export const MIN_CLIP_LENGTH = 2

/** 单次自动采集批量写入的新增上限（防扫描风暴放大写入） */
export const MAX_NEW_CLIPS_PER_SCAN = 200

/**
 * 去除 Vue 响应式 Proxy 后再写入。
 * IDB 结构化克隆不支持 Proxy（DataCloneError）；
 * 本项目数据均为纯 JSON 兼容结构，JSON 往返即可安全还原为普通对象，
 * 且不向本模块引入 vue 依赖（Service Worker 复用）。
 */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

interface ClipFlowDB extends DBSchema {
  clips: {
    key: string
    value: ClipItem
    indexes: {
      'by-created': number
      'by-url': string
      'by-type': string
      'by-created-id': [number, string]
      'by-capture-created': [string, number, string]
      'by-rule-created': [string, number, string]
    }
  }
  collections: {
    key: string
    value: Collection
  }
  rules: {
    key: string
    value: AutoCaptureRule
  }
  /** 自动采集去重指纹表：hash → clipId */
  fingerprints: {
    key: string
    value: { hash: string; clipId: string; createdAt: number }
  }
  /** 用户偏好：单行 key='prefs' */
  settings: {
    key: string
    value: { key: string; value: unknown }
  }
}

let dbp: Promise<IDBPDatabase<ClipFlowDB>> | null = null

function getDb(): Promise<IDBPDatabase<ClipFlowDB>> {
  if (!dbp) {
    dbp = openDB<ClipFlowDB>(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _oldVersion2, tx) {
        // ---- clips / collections ----
        if (oldVersion < 1) {
          const clips = db.createObjectStore('clips', { keyPath: 'id' })
          clips.createIndex('by-created', 'createdAt')
          clips.createIndex('by-url', 'source.url')
          clips.createIndex('by-type', 'metadata.contentType')
          // 复合索引：createdAt 同毫秒的多条记录仍可稳定键集分页
          clips.createIndex('by-created-id', ['createdAt', 'id'])
          db.createObjectStore('collections', { keyPath: 'id' })
        }

        if (oldVersion < 2) {
          db.createObjectStore('rules', { keyPath: 'id' })
          db.createObjectStore('fingerprints', { keyPath: 'hash' })

          const clips = tx.objectStore('clips')
          clips.createIndex('by-capture-created', [
            'captureType',
            'createdAt',
            'id',
          ])
          clips.createIndex('by-rule-created', ['ruleId', 'createdAt', 'id'])
          // 存量记录回填采集通道：v1 全部为手动复制
          let cursor = await clips.openCursor()
          while (cursor) {
            const value = cursor.value as ClipItem
            if (!value.captureType) {
              value.captureType = 'clipboard'
              await cursor.update(value)
            }
            cursor = await cursor.continue()
          }
        }
        if (oldVersion < 3) {
          db.createObjectStore('settings', { keyPath: 'key' })
        }
      },
    })
  }
  return dbp
}

// ============================== Clips ==============================

/**
 * 由捕获数据创建剪藏。
 * 规则：空内容 / 少于 2 字符忽略；与最新一条完全相同（连续重复）跳过。
 */
export async function createClip(payload: CapturePayload): Promise<ClipItem | null> {
  const content = (payload.content ?? '').replace(/\r\n/g, '\n').trim()
  if (content.length < MIN_CLIP_LENGTH) return null

  const db = await getDb()
  const tx = db.transaction('clips', 'readwrite')
  const store = tx.objectStore('clips')
  const cursor = await store.index('by-created').openCursor(null, 'prev')
  const latest = cursor?.value
  if (latest && latest.content === content) {
    void cursor
    await tx.done
    return null
  }

  const item: ClipItem = {
    id: genId('clip'),
    content,
    captureType: 'clipboard',
    source: {
      url: payload.url || '',
      title: payload.title || '',
      favicon: payload.favicon || '',
    },
    createdAt: payload.capturedAt || Date.now(),
    starred: false,
    tags: [],
    collectionId: null,
    metadata: {
      length: content.length,
      contentType: detectContentType(content),
      wordCount: countWords(content),
    },
    ai: null,
  }
  await store.put(toPlain(item))
  await tx.done
  return item
}

export async function getClip(id: string): Promise<ClipItem | undefined> {
  return (await getDb()).get('clips', id)
}

export interface ClipListFilter {
  captureType?: CaptureType
  ruleId?: string
}

/**
 * 过滤分页统一走复合索引 [prefix, createdAt, id]：
 * - 首页：bound([prefix], [prefix, []]) 覆盖整个前缀，prev 游标倒序
 * - 翻页：上界收紧为 [prefix, before.createdAt, before.id]（排他）
 */
function resolveFilterIndex(filter: ClipListFilter): {
  indexName: 'by-created-id' | 'by-capture-created' | 'by-rule-created'
  prefix: string | null
} {
  if (filter.ruleId) return { indexName: 'by-rule-created', prefix: filter.ruleId }
  if (filter.captureType)
    return { indexName: 'by-capture-created', prefix: filter.captureType }
  return { indexName: 'by-created-id', prefix: null }
}

/** 按时间倒序分页列出；before 为上一页最后一条的 [createdAt, id]（键集分页，无同毫秒丢页/重页问题） */
export async function listClips(
  opts: {
    limit?: number
    before?: [number, string]
    captureType?: CaptureType
    ruleId?: string
  } = {},
): Promise<ClipItem[]> {
  const { limit = 60, before, captureType, ruleId } = opts
  const tx = (await getDb()).transaction('clips')
  const { indexName, prefix } = resolveFilterIndex({ captureType, ruleId })
  const index = tx.objectStore('clips').index(indexName)

  let range: IDBKeyRange | undefined
  if (prefix) {
    range =
      before != null
        ? IDBKeyRange.bound([prefix], [prefix, before[0], before[1]], false, true)
        : IDBKeyRange.bound([prefix], [prefix, []])
  } else if (before != null) {
    range = IDBKeyRange.upperBound(before, true)
  }

  const out: ClipItem[] = []
  let cursor = await index.openCursor(range, 'prev')
  while (cursor && out.length < limit) {
    out.push(cursor.value)
    cursor = await cursor.continue()
  }
  return out
}

/**
 * 全文搜索：倒序游标流式扫描，避免一次性载入全部记录；
 * 收集到 limit*2 条候选即提前终止，兼顾相关性与扫描成本。
 * 可选按采集通道 / 规则过滤（走复合索引，天然跳过不相关记录）。
 */
export async function searchClips(
  tokens: string[],
  opts: { limit?: number; captureType?: CaptureType; ruleId?: string } = {},
): Promise<ClipItem[]> {
  if (!tokens.length) return []
  const { limit = 300, captureType, ruleId } = opts
  const hits: { item: ClipItem; score: number }[] = []
  const cap = Math.max(limit * 2, 200)
  const tx = (await getDb()).transaction('clips')
  const { indexName, prefix } = resolveFilterIndex({ captureType, ruleId })
  const index = tx.objectStore('clips').index(indexName)
  const range = prefix ? IDBKeyRange.bound([prefix], [prefix, []]) : undefined
  let cursor = await index.openCursor(range, 'prev')
  while (cursor) {
    const score = matchClip(cursor.value, tokens)
    if (score > 0) {
      hits.push({ item: cursor.value, score })
      if (hits.length >= cap) break
    }
    cursor = await cursor.continue()
  }
  hits.sort(
    (a, b) => b.score - a.score || b.item.createdAt - a.item.createdAt,
  )
  return hits.slice(0, limit).map((h) => h.item)
}

/** 编辑剪藏正文，并同步重算元数据 */
export async function updateClipContent(
  id: string,
  content: string,
): Promise<ClipItem | null> {
  const db = await getDb()
  const clip = await db.get('clips', id)
  if (!clip) return null
  clip.content = content
  clip.updatedAt = Date.now()
  clip.metadata = {
    ...clip.metadata,
    length: content.length,
    contentType: detectContentType(content),
    wordCount: countWords(content),
  }
  await db.put('clips', toPlain(clip))
  return clip
}

export async function deleteClip(id: string): Promise<void> {
  await (await getDb()).delete('clips', id)
}

export async function deleteClips(ids: string[]): Promise<void> {
  if (!ids.length) return
  const db = await getDb()
  const tx = db.transaction('clips', 'readwrite')
  const store = tx.objectStore('clips')
  await Promise.all(ids.map((id) => store.delete(id)))
  await tx.done
}

export async function clearClips(): Promise<void> {
  await (await getDb()).clear('clips')
}

/**
 * 按过滤条件删除全部匹配记录（单事务）。
 * 返回被删除的 id 列表，供调用方同步清理工作台引用。
 */
export async function deleteAllClips(
  filter: ClipListFilter = {},
): Promise<string[]> {
  const db = await getDb()
  const { indexName, prefix } = resolveFilterIndex(filter)
  const readTx = db.transaction('clips')
  const index = readTx.objectStore('clips').index(indexName)
  const range = prefix ? IDBKeyRange.bound([prefix], [prefix, []]) : undefined

  const ids: string[] = []
  let cursor = await index.openKeyCursor(range, 'prev')
  while (cursor) {
    ids.push(String(cursor.primaryKey))
    cursor = await cursor.continue()
  }
  if (!ids.length) return []

  const tx = db.transaction('clips', 'readwrite')
  const store = tx.objectStore('clips')
  for (const id of ids) await store.delete(id)
  await tx.done
  return ids
}

export async function countClips(): Promise<number> {
  return (await getDb()).count('clips')
}

// ============================== Collections ==============================

export async function listCollections(): Promise<Collection[]> {
  const all = await (await getDb()).getAll('collections')
  return all.sort((a, b) => a.createdAt - b.createdAt)
}

export async function saveCollection(
  input: Omit<Collection, 'id'> & { id?: string },
): Promise<Collection> {
  const db = await getDb()
  const col: Collection = {
    ...input,
    id: input.id || genId('col'),
    clips: input.clips ?? [],
    tags: input.tags ?? [],
    ai: input.ai ?? null,
    createdAt: input.createdAt || Date.now(),
    updatedAt: Date.now(),
  }
  await db.put('collections', toPlain(col))
  return col
}

export async function deleteCollection(id: string): Promise<void> {
  await (await getDb()).delete('collections', id)
}

// ============================== Auto Capture Rules ==============================

export async function listRules(): Promise<AutoCaptureRule[]> {
  const all = await (await getDb()).getAll('rules')
  return all.sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function listEnabledRules(): Promise<AutoCaptureRule[]> {
  const all = await listRules()
  return all.filter((r) => r.enabled)
}

export async function getRule(id: string): Promise<AutoCaptureRule | undefined> {
  return (await getDb()).get('rules', id)
}

export async function saveRule(
  input: Omit<AutoCaptureRule, 'id'> & { id?: string },
): Promise<AutoCaptureRule> {
  const db = await getDb()
  const rule: AutoCaptureRule = {
    ...input,
    id: input.id || genId('rule'),
    enabled: input.enabled !== false,
    scope: input.scope ?? { type: 'page' },
    stats: input.stats ?? { matchCount: 0, lastMatchedAt: null },
    createdAt: input.createdAt || Date.now(),
    updatedAt: Date.now(),
  }
  await db.put('rules', toPlain(rule))
  return rule
}

/** 删除规则：仅删规则本身，历史采集记录与指纹均保留 */
export async function deleteRule(id: string): Promise<void> {
  await (await getDb()).delete('rules', id)
}

// ============================== Prefs ==============================

export async function getPrefs(): Promise<Prefs> {
  const row = await (await getDb()).get('settings', 'prefs')
  return { ...DEFAULT_PREFS, ...((row?.value as Partial<Prefs>) ?? {}) }
}

export async function savePrefs(partial: Partial<Prefs>): Promise<Prefs> {
  const merged = { ...(await getPrefs()), ...partial }
  await (await getDb()).put(
    'settings',
    toPlain({ key: 'prefs', value: merged }),
  )
  return merged
}

// ============================== Auto Capture 落库 ==============================

/**
 * 处理一次扫描上报的候选匹配：
 * 1) 归一化 + 过短过滤；
 * 2) 按 rule.deduplication 生成 SHA-256 指纹（page/global 两种 scope）；
 * 3) fingerprints / clips / rules(统计) 三 store 单事务批量写入，
 *    指纹命中即跳过——天然解决“刷新/SPA 来回/Mutation 重复保存”，
 *    且多 Tab 并发上报时以后台串行事务为准，不会互相覆盖。
 */
export async function addClipsFromMatches(
  payload: AutoCaptureScanPayload,
): Promise<{ created: ClipItem[] }> {
  const db = await getDb()

  const ruleIds = [...new Set(payload.matches.map((m) => m.ruleId))]
  const rules = new Map<string, AutoCaptureRule>()
  for (const id of ruleIds) {
    const r = await db.get('rules', id)
    if (r?.enabled) rules.set(id, r)
  }

  const seenInPayload = new Set<string>()
  const candidates: {
    hash: string | null
    content: string
    index: number
    rule: AutoCaptureRule
  }[] = []

  for (const m of payload.matches) {
    const rule = rules.get(m.ruleId)
    if (!rule) continue
    const trimmed = (m.content ?? '').replace(/\r\n/g, '\n').trim()
    if (trimmed.length < MIN_CLIP_LENGTH) continue
    const norm = normalizeCaptureText(trimmed)
    if (norm.length < MIN_CLIP_LENGTH) continue

    let hash: string | null = null
    if (rule.deduplication?.enabled !== false) {
      hash = await createCaptureFingerprint({
        ruleId: rule.id,
        url: payload.url,
        content: norm,
        scope: rule.deduplication?.scope === 'global' ? 'global' : 'page',
      })
      if (seenInPayload.has(hash)) continue
      seenInPayload.add(hash)
    }
    candidates.push({ hash, content: norm, index: m.index, rule })
    if (candidates.length >= MAX_NEW_CLIPS_PER_SCAN) break
  }
  if (!candidates.length) return { created: [] }

  const created: ClipItem[] = []
  const now = Date.now()
  const tx = db.transaction(['clips', 'fingerprints', 'rules'], 'readwrite')
  {
    const fps = tx.objectStore('fingerprints')
    const clipsStore = tx.objectStore('clips')
    const rulesStore = tx.objectStore('rules')
    const touchedStats = new Map<string, AutoCaptureRule>()

    for (const c of candidates) {
      if (c.hash && (await fps.get(c.hash))) continue
      const clip: ClipItem = {
        id: genId('clip'),
        content: c.content,
        captureType: 'auto',
        source: {
          url: payload.url || '',
          title: payload.title || '',
          favicon: payload.favicon || '',
        },
        createdAt: payload.capturedAt || now,
        starred: false,
        tags: [],
        collectionId: null,
        ruleId: c.rule.id,
        ruleName: c.rule.name,
        metadata: {
          length: c.content.length,
          contentType: detectContentType(c.content),
          wordCount: countWords(c.content),
          matchIndex: c.index,
        },
        ai: null,
      }
      await clipsStore.put(toPlain(clip))
      created.push(clip)
      if (c.hash) await fps.put({ hash: c.hash, clipId: clip.id, createdAt: now })

      const stat = touchedStats.get(c.rule.id) ?? toPlain(c.rule)
      stat.stats = {
        matchCount: (stat.stats?.matchCount ?? 0) + 1,
        lastMatchedAt: now,
      }
      touchedStats.set(c.rule.id, stat)
    }
    for (const r of touchedStats.values()) await rulesStore.put(r)
  }
  await tx.done

  return { created }
}

// ============================== 导入导出 ==============================

export async function exportAll(): Promise<ExportBundle> {
  const db = await getDb()
  return {
    app: 'ClipFlow',
    version: 1,
    exportedAt: Date.now(),
    clips: await db.getAll('clips'),
    collections: await db.getAll('collections'),
  }
}

function sanitizeClip(raw: unknown): ClipItem | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.content !== 'string' || !r.content.trim()) return null
  const src = (r.source ?? {}) as Record<string, unknown>
  return {
    id: typeof r.id === 'string' && r.id ? r.id : genId('clip'),
    content: r.content,
    captureType: r.captureType === 'auto' ? 'auto' : 'clipboard',
    source: {
      url: String(src.url ?? ''),
      title: String(src.title ?? ''),
      favicon: String(src.favicon ?? ''),
    },
    createdAt: Number(r.createdAt) || Date.now(),
    updatedAt: Number(r.updatedAt) || undefined,
    starred: Boolean(r.starred),
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    collectionId: null,
    metadata: {
      length: r.content.length,
      contentType: detectContentType(r.content),
      wordCount: countWords(r.content),
    },
    ai: null,
  }
}

function sanitizeCollection(raw: unknown): Collection | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (typeof r.title !== 'string') return null
  return {
    id: typeof r.id === 'string' && r.id ? r.id : genId('col'),
    title: r.title,
    clips: Array.isArray(r.clips) ? r.clips.map(String) : [],
    createdAt: Number(r.createdAt) || Date.now(),
    updatedAt: Number(r.updatedAt) || Date.now(),
    tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
    ai: null,
  }
}

/** 导入 JSON 备份：ID 冲突时重新生成，返回新增与跳过计数 */
export async function importBundle(
  bundle: Partial<ExportBundle>,
): Promise<{ added: number; skipped: number }> {
  const db = await getDb()
  let added = 0
  let skipped = 0

  for (const raw of Array.isArray(bundle.clips) ? bundle.clips : []) {
    const item = sanitizeClip(raw)
    if (!item) {
      skipped++
      continue
    }
    if (await db.get('clips', item.id)) item.id = genId('clip')
    await db.put('clips', toPlain(item))
    added++
  }
  for (const raw of Array.isArray(bundle.collections)
    ? bundle.collections
    : []) {
    const col = sanitizeCollection(raw)
    if (!col) {
      skipped++
      continue
    }
    if (await db.get('collections', col.id)) col.id = genId('col')
    await db.put('collections', toPlain(col))
  }
  return { added, skipped }
}
