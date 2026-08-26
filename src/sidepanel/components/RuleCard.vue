<script setup lang="ts">
import { computed } from 'vue'
import { NButton, NIcon, NPopconfirm, NSwitch, NTag } from 'naive-ui'
import {
  CopyOutline,
  CreateOutline,
  FlaskOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import type { AutoCaptureRule } from '../../auto-capture/types'
import { timeAgo } from '../../utils/format'

const props = defineProps<{ rule: AutoCaptureRule }>()
const emit = defineEmits<{
  (e: 'edit'): void
  (e: 'toggle'): void
  (e: 'duplicate'): void
  (e: 'remove'): void
  (e: 'test'): void
}>()

const urlLabel = computed(() => {
  const c = props.rule.urlCondition
  if (c.type === 'all') return '所有页面'
  if (c.type === 'wildcard') return c.value || '*'
  return `/${c.value}/`
})

const triggerLabels = computed(() => {
  const t = props.rule.triggers
  const out: string[] = []
  if (t.pageLoad) out.push('加载')
  if (t.spaNavigation) out.push('SPA')
  if (t.domChange) out.push('动态')
  return out.join(' · ')
})

const regexPreview = computed(() => {
  const p = props.rule.pattern
  return `/${p.regex}/${p.flags}`
})
</script>

<template>
  <article class="rule-card glass" :class="{ disabled: !rule.enabled }">
    <header class="rc-head">
      <span class="rc-dot" :class="rule.enabled ? 'on' : 'off'" />
      <span class="rc-name">{{ rule.name }}</span>
      <span class="flex-spacer" />
      <n-switch size="small" :value="rule.enabled" @update:value="emit('toggle')" />
    </header>

    <div class="rc-body">
      <p class="rc-line rc-url" :title="urlLabel">
        <n-tag size="tiny" :bordered="false" round class="rc-url-type">
          {{ rule.urlCondition.type === 'all' ? 'ALL' : rule.urlCondition.type === 'wildcard' ? 'GLOB' : 'RE' }}
        </n-tag>
        {{ urlLabel }}
      </p>
      <p class="rc-line rc-regex">{{ regexPreview }}</p>
      <div class="rc-meta">
        <span v-if="triggerLabels">{{ triggerLabels }}</span>
        <span>去重{{ rule.deduplication?.enabled === false ? '关' : rule.deduplication?.scope === 'global' ? '·全局' : '·页面' }}</span>
        <span v-if="(rule.stats?.matchCount ?? 0) > 0" class="rc-count">
          已采集 {{ rule.stats!.matchCount }}
          <template v-if="rule.stats?.lastMatchedAt">· {{ timeAgo(rule.stats.lastMatchedAt) }}</template>
        </span>
      </div>
    </div>

    <footer class="rc-actions">
      <n-button size="tiny" quaternary @click="emit('test')">
        <n-icon :component="FlaskOutline" /> 测试
      </n-button>
      <n-button size="tiny" quaternary @click="emit('edit')">
        <n-icon :component="CreateOutline" /> 编辑
      </n-button>
      <n-button size="tiny" quaternary @click="emit('duplicate')">
        <n-icon :component="CopyOutline" /> 复制
      </n-button>
      <n-popconfirm :show-icon="false" @positive-click="emit('remove')">
        <template #trigger>
          <n-button size="tiny" quaternary type="error">
            <n-icon :component="TrashOutline" /> 删除
          </n-button>
        </template>
        删除规则？历史记录将保留。
      </n-popconfirm>
    </footer>
  </article>
</template>

<style scoped>
.rule-card {
  padding: 10px 12px;
  transition: border-color 0.18s ease;
}
.rule-card:hover {
  border-color: rgba(99, 102, 241, 0.45);
}
.rule-card.disabled {
  opacity: 0.62;
}

.rc-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.rc-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex: none;
}
.rc-dot.on {
  background: #34d399;
  box-shadow: 0 0 6px rgba(52, 211, 153, 0.7);
}
.rc-dot.off {
  background: #475569;
}
.rc-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--txt);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rc-body {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.rc-line {
  margin: 0;
  font-size: 11.5px;
  color: var(--sub);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rc-url {
  display: flex;
  align-items: center;
  gap: 5px;
}
.rc-url-type {
  background: rgba(14, 165, 233, 0.2) !important;
  color: #7dd3fc !important;
  font-size: 9px !important;
  flex: none;
}
.rc-regex {
  font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
  color: var(--accent-soft);
}

.rc-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  font-size: 10.5px;
  color: var(--dim);
}
.rc-count {
  color: #34d399;
}

.rc-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
}
</style>
