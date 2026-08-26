<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { NButton, NIcon, NPopconfirm, NSelect, NSpin, useMessage } from 'naive-ui'
import {
  CheckboxOutline,
  CloseOutline,
  CopyOutline,
  DocumentTextOutline,
  LibraryOutline,
  SearchOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import { useClipsStore } from '../../stores/clips'
import { useRulesStore } from '../../stores/rules'
import { tokenize } from '../../utils/search'
import ClipCard from '../components/ClipCard.vue'
import EmptyState from '../components/EmptyState.vue'

const store = useClipsStore()
const rulesStore = useRulesStore()
const message = useMessage()

const tokens = computed(() => tokenize(store.query))

const modeOptions = [
  { label: '全部', value: 'all' },
  { label: '手动复制', value: 'clipboard' },
  { label: '自动采集', value: 'auto' },
]
const ruleOptions = computed(() =>
  rulesStore.rules.map((r) => ({ label: r.name, value: r.id })),
)

const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

// ---------- 选择模式 ----------
const selectMode = ref(false)
const selectedIds = ref(new Set<string>())

watch(selectMode, (on) => {
  if (!on) selectedIds.value = new Set()
})

function toggleSelect(id: string): void {
  const next = new Set(selectedIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedIds.value = next
}

const allSelected = computed(
  () => store.items.length > 0 && store.items.every((i) => selectedIds.value.has(i.id)),
)

function toggleAll(): void {
  if (allSelected.value) selectedIds.value = new Set()
  else selectedIds.value = new Set(store.items.map((i) => i.id))
}

async function removeSelected(): Promise<void> {
  const ids = [...selectedIds.value]
  const n = await store.removeMany(ids)
  selectedIds.value = new Set()
  message.success(`已删除 ${n} 条`)
}

async function removeAll(): Promise<void> {
  selectMode.value = false
  const n = await store.removeAllFiltered()
  message.success(`已删除 ${n} 条`)
}

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => {
      if (entries[0]?.isIntersecting) void store.loadMore()
    },
    { rootMargin: '200px' },
  )
  if (sentinel.value) observer.observe(sentinel.value)
})

onUnmounted(() => observer?.disconnect())

async function copyAll(): Promise<void> {
  if (!store.items.length) return
  const ok = await store.copyAll()
  ok
    ? message.success(`已复制 ${store.items.length} 条内容`)
    : message.error('复制失败，请重试')
}

async function copyDetailed(): Promise<void> {
  if (!store.items.length) return
  const ok = await store.copyAllDetailed()
  ok
    ? message.success(`已复制 ${store.items.length} 条（Markdown 含来源）`)
    : message.error('复制失败，请重试')
}
</script>

<template>
  <section class="page">
    <div class="filter-bar">
      <n-select
        v-model:value="store.captureMode"
        size="tiny"
        class="filter-mode"
        :options="modeOptions"
      />
      <n-select
        v-if="store.captureMode === 'auto'"
        v-model:value="store.ruleFilter"
        size="tiny"
        class="filter-rule"
        placeholder="全部规则"
        clearable
        :options="ruleOptions"
      />
    </div>

    <div class="clip-scroll">
      <TransitionGroup name="clip" tag="div" class="clip-list">
        <ClipCard
          v-for="clip in store.items"
          :key="clip.id"
          :clip="clip"
          :tokens="tokens"
          :selectable="selectMode"
          :selected="selectedIds.has(clip.id)"
          @toggle-select="toggleSelect"
        />
      </TransitionGroup>

      <EmptyState
        v-if="!store.loading && !store.items.length"
        :title="
          store.isSearching
            ? '没有匹配的剪藏'
            : store.captureMode === 'auto'
              ? '还没有自动采集记录'
              : '还没有复制记录'
        "
        :description="
          store.isSearching
            ? '换个关键词试试，支持搜索正文、网页标题与网址。'
            : store.captureMode === 'auto'
              ? '到「自动采集」页创建规则后，命中的页面内容会出现在这里。'
              : '在任意网页选中文字按 Ctrl+C，内容会自动出现在这里。'
        "
      >
        <template #icon>
          <n-icon size="22" :component="store.isSearching ? SearchOutline : LibraryOutline" />
        </template>
      </EmptyState>

      <div ref="sentinel" class="sentinel">
        <n-spin v-if="store.loading && !store.exhausted" size="small" />
      </div>
    </div>

    <!-- 选择模式：批量操作栏（信息一行、按钮一行） -->
    <footer v-if="selectMode" class="page-footer select-footer">
      <div class="sel-info">
        <button class="check-all" :class="{ checked: allSelected }" @click="toggleAll">
          <n-icon size="13" :component="CheckboxOutline" />
          全选（{{ store.items.length }} 条）
        </button>
        <span class="sel-count">已选 {{ selectedIds.size }}</span>
        <span class="flex-spacer" />
      </div>
      <div class="sel-actions">
        <n-popconfirm :show-icon="false" @positive-click="removeSelected">
          <template #trigger>
            <n-button size="tiny" type="error" secondary :disabled="!selectedIds.size">
              <template #icon><n-icon :component="TrashOutline" /></template>
              删除所选
            </n-button>
          </template>
          删除已勾选的 {{ selectedIds.size }} 条？
        </n-popconfirm>
        <n-popconfirm :show-icon="false" @positive-click="removeAll">
          <template #trigger>
            <n-button size="tiny" quaternary :disabled="!store.totalCount">
              全部删除
            </n-button>
          </template>
          将删除当前筛选下的全部记录（含未加载的历史），且无法恢复。确定？
        </n-popconfirm>
        <span class="flex-spacer" />
        <n-button size="tiny" quaternary @click="selectMode = false">
          <template #icon><n-icon :component="CloseOutline" /></template>
          取消
        </n-button>
      </div>
    </footer>

    <footer v-else class="page-footer">
      <span class="total">
        共 {{ store.totalCount }} 条{{ store.isSearching ? '结果' : '剪藏' }}
        <template v-if="store.isSearching">（当前展示 {{ store.items.length }} 条）</template>
      </span>
      <span class="flex-spacer" />
      <n-button size="tiny" quaternary title="批量选择后删除" @click="selectMode = true">
        <template #icon>
          <n-icon :component="CheckboxOutline" />
        </template>
        选择
      </n-button>
      <n-button
        size="tiny"
        :disabled="!store.items.length"
        title="Markdown 格式：含文档头与每条来源"
        @click="copyDetailed"
      >
        <template #icon>
          <n-icon :component="DocumentTextOutline" />
        </template>
        详情
      </n-button>
      <n-button size="tiny" type="primary" :disabled="!store.items.length" title="仅复制原始内容，无任何附加信息" @click="copyAll">
        <template #icon>
          <n-icon :component="CopyOutline" />
        </template>
        复制全部
      </n-button>
    </footer>
  </section>
</template>

<style scoped>
.select-footer {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding-top: 8px;
  padding-bottom: 8px;
}
.sel-info,
.sel-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.sel-info > *,
.sel-actions > * {
  flex: none;
}
.sel-count {
  font-size: 12px;
  color: var(--txt);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.check-all {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  background: transparent;
  color: var(--sub);
  font-size: 12px;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 6px;
  white-space: nowrap;
}
.check-all:hover {
  color: var(--txt);
  background: var(--panel);
}
.check-all.checked {
  color: #6366f1;
}

.filter-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 0;
}
.filter-mode {
  width: 104px;
  flex: none;
}
.filter-rule {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
