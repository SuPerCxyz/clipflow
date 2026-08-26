import { ref } from 'vue'
import { defineStore } from 'pinia'
import type {
  AutoCaptureDeduplication,
  AutoCapturePattern,
  AutoCaptureRule,
  AutoCaptureTriggers,
  AutoCaptureUrlCondition,
} from '../auto-capture/types'
import * as db from '../database/indexeddb'

export interface RuleFormDraft {
  name: string
  enabled: boolean
  urlType: AutoCaptureUrlCondition['type']
  urlValue: string
  regex: string
  flags: string
  captureGroup: number
  triggers: AutoCaptureTriggers
  deduplication: AutoCaptureDeduplication
}

export function blankDraft(): RuleFormDraft {
  return {
    name: '',
    enabled: true,
    urlType: 'wildcard',
    urlValue: '',
    regex: '',
    flags: 'gi',
    captureGroup: 1,
    triggers: { pageLoad: true, spaNavigation: true, domChange: true },
    deduplication: { enabled: true, scope: 'page' },
  }
}

export function draftFromRule(rule: AutoCaptureRule): RuleFormDraft {
  return {
    name: rule.name,
    enabled: rule.enabled,
    urlType: rule.urlCondition.type,
    urlValue: rule.urlCondition.value,
    regex: rule.pattern.regex,
    flags: rule.pattern.flags,
    captureGroup: rule.pattern.captureGroup,
    triggers: { ...rule.triggers },
    deduplication: { ...rule.deduplication },
  }
}

function draftToRule(draft: RuleFormDraft, base?: AutoCaptureRule): Omit<AutoCaptureRule, 'id'> & { id?: string } {
  const condition: AutoCaptureUrlCondition =
    draft.urlType === 'all'
      ? { type: 'all', value: '*' }
      : { type: draft.urlType, value: draft.urlValue.trim() }
  const pattern: AutoCapturePattern = {
    regex: draft.regex,
    flags: draft.flags.replace(/[^gimsuy]/g, ''),
    captureGroup: Math.max(0, Math.min(9, Math.floor(draft.captureGroup || 0))),
  }
  return {
    ...(base ? { id: base.id } : {}),
    name: draft.name.trim() || '未命名规则',
    enabled: draft.enabled,
    urlCondition: condition,
    pattern,
    triggers: { ...draft.triggers },
    deduplication: { ...draft.deduplication },
    scope: { type: 'page' },
    stats: base?.stats ?? { matchCount: 0, lastMatchedAt: null },
    createdAt: base?.createdAt ?? Date.now(),
    updatedAt: Date.now(),
  }
}

export const useRulesStore = defineStore('rules', () => {
  const rules = ref<AutoCaptureRule[]>([])
  const loaded = ref(false)

  async function loadAll(): Promise<void> {
    rules.value = await db.listRules()
    loaded.value = true
  }

  /** 规则变更后通知所有 Content Script 刷新缓存（立即生效，无需刷新页面） */
  async function announce(): Promise<void> {
    try {
      await chrome.runtime.sendMessage({
        type: 'RULES_UPDATED',
        rules: await db.listEnabledRules(),
      })
    } catch {
      /* 无接收方时静默 */
    }
  }

  async function saveFromDraft(
    draft: RuleFormDraft,
    editing?: AutoCaptureRule | null,
  ): Promise<AutoCaptureRule> {
    const saved = await db.saveRule(draftToRule(draft, editing ?? undefined))
    await loadAll()
    await announce()
    return saved
  }

  async function toggle(id: string): Promise<void> {
    const rule = rules.value.find((r) => r.id === id)
    if (!rule) return
    await db.saveRule({ ...rule, enabled: !rule.enabled })
    await loadAll()
    await announce()
  }

  async function duplicate(id: string): Promise<void> {
    const source = rules.value.find((r) => r.id === id)
    if (!source) return
    const { id: _omit, createdAt: _c, updatedAt: _u, stats: _s, ...rest } = source
    await db.saveRule({
      ...rest,
      name: `${source.name} 副本`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      stats: { matchCount: 0, lastMatchedAt: null },
    })
    await loadAll()
    await announce()
  }

  /** 仅删除规则本身；历史采集记录与指纹保留 */
  async function remove(id: string): Promise<void> {
    await db.deleteRule(id)
    rules.value = rules.value.filter((r) => r.id !== id)
    await announce()
  }

  return { rules, loaded, loadAll, saveFromDraft, toggle, duplicate, remove }
})
