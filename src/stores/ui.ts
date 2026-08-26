import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { ClipItem } from '../types'
import type { AutoCaptureRule } from '../auto-capture/types'

export type TabKey = 'clips' | 'workspace' | 'rules' | 'settings'

/** 规则编辑弹窗状态（创建时 editingRule=null） */
export const useUiStore = defineStore('ui', () => {
  const tab = ref<TabKey>('clips')
  const editingClip = ref<ClipItem | null>(null)
  const showEdit = ref(false)
  const editingRule = ref<AutoCaptureRule | null>(null)
  const showRuleEdit = ref(false)

  function openEditor(clip: ClipItem): void {
    editingClip.value = clip
    showEdit.value = true
  }

  function closeEditor(): void {
    showEdit.value = false
    editingClip.value = null
  }

  function openRuleEditor(rule: AutoCaptureRule | null): void {
    editingRule.value = rule
    showRuleEdit.value = true
  }

  function closeRuleEditor(): void {
    showRuleEdit.value = false
    editingRule.value = null
  }

  return {
    tab,
    editingClip,
    showEdit,
    openEditor,
    closeEditor,
    editingRule,
    showRuleEdit,
    openRuleEditor,
    closeRuleEditor,
  }
})
