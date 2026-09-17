<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  NConfigProvider,
  NInput,
  NMessageProvider,
  NTab,
  NTabs,
  NIcon,
  darkTheme,
  dateZhCN,
  zhCN,
} from 'naive-ui'
import type { GlobalTheme, GlobalThemeOverrides } from 'naive-ui'
import { SearchOutline } from '@vicons/ionicons5'
import { useUiStore } from '../stores/ui'
import { useClipsStore } from '../stores/clips'
import { useWorkspaceStore } from '../stores/workspace'
import ClipsPage from './pages/ClipsPage.vue'
import WorkspacePage from './pages/WorkspacePage.vue'
import RulesPage from './pages/RulesPage.vue'
import SettingsPage from './pages/SettingsPage.vue'
import EditClipModal from './components/EditClipModal.vue'
import RuleEditModal from './components/RuleEditModal.vue'

const ui = useUiStore()
const clips = useClipsStore()
const ws = useWorkspaceStore()

/** 明暗跟随浏览器（prefers-color-scheme） */
const prefersDark = ref(
  window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? true,
)
const onSchemeChange = (e: MediaQueryListEvent): void => {
  prefersDark.value = e.matches
}
onMounted(() => {
  window.matchMedia('(prefers-color-scheme: dark)')?.addEventListener('change', onSchemeChange)
})
onUnmounted(() => {
  window.matchMedia('(prefers-color-scheme: dark)')?.removeEventListener('change', onSchemeChange)
  window.removeEventListener('resize', schedulePopupClamp)
  window.removeEventListener('scroll', schedulePopupClamp, true)
  popupObserver?.disconnect()
  popupObserver = null
  if (popupClampFrame != null) cancelAnimationFrame(popupClampFrame)
  popupClampFrame = null
  if (popupClampTimer != null) clearTimeout(popupClampTimer)
  popupClampTimer = null
})

const theme = computed<GlobalTheme | null>(() => (prefersDark.value ? darkTheme : null))

const DARK_OVERRIDES: GlobalThemeOverrides = {
  common: {
    primaryColor: '#6366F1',
    primaryColorHover: '#818CF8',
    primaryColorPressed: '#4F46E5',
    primaryColorSuppl: '#0EA5E9',
    infoColor: '#0EA5E9',
    infoColorHover: '#38BDF8',
    infoColorPressed: '#0284C7',
    infoColorSuppl: '#38BDF8',
    bodyColor: 'transparent',
    cardColor: 'rgba(148, 163, 184, 0.06)',
    modalColor: '#131C31',
    popoverColor: '#1E293B',
    inputColor: 'rgba(2, 6, 23, 0.45)',
    borderRadius: '10px',
    fontSizeSmall: '12px',
  },
}

const LIGHT_OVERRIDES: GlobalThemeOverrides = {
  common: {
    primaryColor: '#6366F1',
    primaryColorHover: '#4F46E5',
    primaryColorPressed: '#4338CA',
    primaryColorSuppl: '#0EA5E9',
    infoColor: '#0EA5E9',
    infoColorHover: '#0284C7',
    infoColorPressed: '#0369A1',
    infoColorSuppl: '#0284C7',
    bodyColor: 'transparent',
    cardColor: 'rgba(255, 255, 255, 0.78)',
    modalColor: '#ffffff',
    popoverColor: '#ffffff',
    inputColor: 'rgba(15, 23, 42, 0.04)',
    borderRadius: '10px',
    fontSizeSmall: '12px',
  },
}

const themeOverrides = computed(() =>
  prefersDark.value ? DARK_OVERRIDES : LIGHT_OVERRIDES,
)

let popupClampFrame: number | null = null
let popupClampTimer: ReturnType<typeof setTimeout> | null = null
let popupObserver: MutationObserver | null = null

/**
 * 将 Naive UI 的浮层（popconfirm / select 菜单 / dropdown 等）水平收进侧边栏可视区。
 * 侧边栏较窄且贴浏览器右侧，浮层按目标元素右对齐时容易向左/右溢出到视野外。
 *
 * 做法：对每个浮层容器追加 `translateX(shift)`，并在下次计算前用 data 标记移除自身位移，
 * 避免重复累加；因此 Naive 重新定位覆盖 transform 后也能自愈。
 */
function clampPopupsToViewport(): void {
  popupClampFrame = null
  const gutter = 12
  const vw = window.innerWidth
  const maxWidth = Math.max(120, vw - gutter * 2)

  for (const wrapper of document.querySelectorAll<HTMLElement>('.v-binder-follower-content')) {
    const popup = wrapper.firstElementChild as HTMLElement | null
    if (!popup) continue

    const prev = Number(wrapper.dataset.cfPopupShift ?? 0)
    if (prev) {
      const suffix = ` translateX(${prev}px)`
      if (wrapper.style.transform.endsWith(suffix)) {
        wrapper.style.transform = wrapper.style.transform.slice(0, -suffix.length)
      }
      delete wrapper.dataset.cfPopupShift
    }

    if (popup.offsetWidth > maxWidth) popup.style.maxWidth = `${maxWidth}px`

    const rect = popup.getBoundingClientRect()
    if (rect.width < 1) continue

    let shift = 0
    if (rect.right > vw - gutter) shift -= rect.right - (vw - gutter)
    if (rect.left + shift < gutter) shift += gutter - (rect.left + shift)

    const rounded = Math.round(shift)
    if (rounded) {
      wrapper.style.transform += ` translateX(${rounded}px)`
      wrapper.dataset.cfPopupShift = String(rounded)
    }
  }
}

function schedulePopupClamp(): void {
  if (popupClampFrame == null) {
    popupClampFrame = requestAnimationFrame(clampPopupsToViewport)
  }
  if (popupClampTimer != null) clearTimeout(popupClampTimer)
  popupClampTimer = setTimeout(() => {
    popupClampTimer = null
    clampPopupsToViewport()
  }, 360)
}

onMounted(() => {
  void clips.init()
  void ws.loadAll()
  popupObserver = new MutationObserver(schedulePopupClamp)
  popupObserver.observe(document.body, { childList: true })
  window.addEventListener('resize', schedulePopupClamp)
  window.addEventListener('scroll', schedulePopupClamp, true)
})

function onSearchInput(): void {
  if (ui.tab !== 'clips') ui.tab = 'clips'
  clips.scheduleSearch()
}

const PAGES = { clips: ClipsPage, workspace: WorkspacePage, rules: RulesPage, settings: SettingsPage }
const page = computed(() => PAGES[ui.tab])
</script>

<template>
  <n-config-provider
    :theme="theme"
    :theme-overrides="themeOverrides"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <n-message-provider placement="bottom">
      <div class="app">
        <header class="app-header">
          <n-input
            v-model:value="clips.query"
            class="search-input"
            size="small"
            round
            clearable
            placeholder="搜索内容 / 标题 / 网址…"
            @input="onSearchInput"
          >
            <template #prefix>
              <n-icon :component="SearchOutline" />
            </template>
          </n-input>

          <n-tabs v-model:value="ui.tab" type="segment" size="small" animated>
            <n-tab name="clips">剪藏</n-tab>
            <n-tab name="workspace">工作台</n-tab>
            <n-tab name="rules">自动采集</n-tab>
            <n-tab name="settings">设置</n-tab>
          </n-tabs>
        </header>

        <main class="app-main">
          <component :is="page" />
        </main>

        <EditClipModal />
        <RuleEditModal :show="ui.showRuleEdit" :rule="ui.editingRule" @update:show="(v: boolean) => (v ? null : ui.closeRuleEditor())" />
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<style scoped>
.search-input {
  --n-border-radius: 999px;
}
.app-header :deep(.n-tabs .n-tabs-rail) {
  background: var(--panel);
  border-radius: 10px;
  padding: 3px;
}
.app-header :deep(.n-tabs .n-tabs-tab) {
  border-radius: 8px;
}
</style>
