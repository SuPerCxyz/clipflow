<script setup lang="ts">
import { computed, ref } from 'vue'
import { NIcon, NPopconfirm, NTag, useMessage } from 'naive-ui'
import {
  AddOutline,
  CopyOutline,
  CreateOutline,
  OpenOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import type { ClipItem } from '../../types'
import { domainOf, faviconSrc, timeAgo } from '../../utils/format'
import { highlight } from '../../utils/search'
import { useClipsStore } from '../../stores/clips'
import { useWorkspaceStore } from '../../stores/workspace'
import { useUiStore } from '../../stores/ui'

const props = defineProps<{
  clip: ClipItem
  tokens?: string[]
  selectable?: boolean
  selected?: boolean
}>()

const emit = defineEmits<{ (e: 'toggle-select', id: string): void }>()

const clips = useClipsStore()
const ws = useWorkspaceStore()
const ui = useUiStore()
const message = useMessage()

const expanded = ref(false)
const favError = ref(false)

const COLLAPSED_CHARS = 140

const domain = computed(() => domainOf(props.clip.source.url))
const title = computed(() => props.clip.source.title || domain.value)
const initial = computed(() => (title.value[0] ?? '?').toUpperCase())
const favUrl = computed(() => faviconSrc(props.clip.source.url))

const shown = computed(() => {
  const c = props.clip.content
  return expanded.value || c.length <= COLLAPSED_CHARS
    ? c
    : c.slice(0, COLLAPSED_CHARS).trimEnd() + ' …'
})
const parts = computed(() => highlight(shown.value, props.tokens ?? []))

async function addToWorkspace(): Promise<void> {
  const res = await ws.addClip(props.clip.id)
  res === 'added'
    ? message.success(`已加入「${ws.active?.title ?? '工作台'}」`)
    : message.info('已在该工作台中')
}

function edit(): void {
  ui.openEditor(props.clip)
}

async function copyOne(): Promise<void> {
  ;(await clips.copyOne(props.clip.id))
    ? message.success('已复制')
    : message.error('复制失败')
}

async function del(): Promise<void> {
  await clips.remove(props.clip.id)
  message.success('已删除')
}
</script>

<template>
  <article class="clip-card glass" :class="{ selected }">
    <header class="cc-head" @click="expanded = !expanded">
      <span
        v-if="selectable"
        class="cc-select"
        :class="{ checked: selected }"
        title="选择"
        @click.stop="emit('toggle-select', clip.id)"
      >
        <svg v-if="selected" viewBox="0 0 16 16" width="11" height="11">
          <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </span>
      <img
        v-if="!favError"
        class="cc-fav"
        :src="favUrl"
        alt=""
        loading="lazy"
        @error="favError = true"
      />
      <span v-else class="cc-fav cc-fallback">{{ initial }}</span>
      <span class="cc-title" :title="clip.source.url">{{ title }}</span>
      <span class="cc-time">{{ timeAgo(clip.createdAt) }}</span>
    </header>

    <div
      class="cc-body"
      :class="{ expanded }"
      @click="expanded = !expanded"
    >
      <p class="cc-content"
        ><template v-for="(part, i) in parts" :key="i"
          ><mark v-if="part.hit">{{ part.text }}</mark
          ><span v-else>{{ part.text }}</span></template
        ></p
      >
      <span v-if="expanded" class="cc-collapse">收起</span>
    </div>

    <footer class="cc-meta">
      <n-tag
        size="tiny"
        :bordered="false"
        round
        class="cc-channel"
        :class="{ 'is-auto': clip.captureType === 'auto' }"
        :title="clip.captureType === 'auto' ? `自动采集 · ${clip.ruleName ?? ''}` : '手动复制'"
      >
        {{ clip.captureType === 'auto' ? `自动 · ${clip.ruleName ?? ''}` : '手动' }}
      </n-tag>
      <a
        class="cc-domain"
        :href="clip.source.url"
        target="_blank"
        rel="noopener noreferrer"
        :title="'打开来源网页：' + clip.source.url"
        @click.stop
      >
        <n-icon size="11" :component="OpenOutline" />
        {{ domain }}
      </a>
      <n-tag size="tiny" :bordered="false" round class="cc-type">
        {{ clip.metadata.contentType }}
      </n-tag>
      <span class="cc-len">{{ clip.metadata.length }} 字符</span>
      <span class="flex-spacer" />
      <button class="cc-act" title="加入工作台" @click.stop="addToWorkspace">
        <n-icon size="15" :component="AddOutline" />
      </button>
      <button class="cc-act" title="编辑" @click.stop="edit">
        <n-icon size="15" :component="CreateOutline" />
      </button>
      <button class="cc-act" title="复制内容" @click.stop="copyOne">
        <n-icon size="15" :component="CopyOutline" />
      </button>
      <n-popconfirm :show-icon="false" @positive-click="del">
        <template #trigger>
          <button class="cc-act danger" title="删除" @click.stop>
            <n-icon size="15" :component="TrashOutline" />
          </button>
        </template>
        删除这条剪藏？
      </n-popconfirm>
    </footer>
  </article>
</template>

<style scoped>
.clip-card {
  padding: 9px 10px 6px;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}
.clip-card:hover {
  border-color: rgba(99, 102, 241, 0.45);
  box-shadow: 0 4px 18px rgba(2, 6, 23, 0.4);
  transform: translateY(-1px);
}

.cc-head {
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  min-width: 0;
}

.cc-select {
  flex: none;
  width: 15px;
  height: 15px;
  border-radius: 4px;
  border: 1.5px solid var(--dim);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  cursor: pointer;
  transition:
    background 0.14s ease,
    border-color 0.14s ease,
    box-shadow 0.14s ease;
}
.cc-select:hover {
  border-color: #6366f1;
  box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.18);
}
.cc-select.checked {
  background: #6366f1;
  border-color: #6366f1;
}
.clip-card.selected {
  border-color: rgba(99, 102, 241, 0.55);
  background: rgba(99, 102, 241, 0.08);
}

.cc-fav {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  flex: none;
  object-fit: cover;
  background: rgba(148, 163, 184, 0.15);
}
.cc-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #c7d2fe;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.5), rgba(14, 165, 233, 0.35));
}

.cc-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--txt);
}

.cc-time {
  flex: none;
  font-size: 10.5px;
  color: var(--dim);
  white-space: nowrap;
}

.cc-body {
  margin-top: 5px;
  cursor: pointer;
}
.cc-content {
  margin: 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--txt-body);
  white-space: pre-wrap;
  word-break: break-word;
}
.cc-body.expanded {
  max-height: 320px;
  overflow-y: auto;
}
.cc-collapse {
  display: inline-block;
  margin-top: 4px;
  font-size: 11px;
  color: #818cf8;
  user-select: none;
}

.cc-meta {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  gap: 5px;
  margin-top: 6px;
  padding-bottom: 2px;
}

.cc-channel {
  flex: 0 1 82px;
  min-width: 0;
  background: var(--panel) !important;
  color: var(--sub) !important;
  font-size: 10px !important;
  max-width: 82px;
  overflow: hidden;
  white-space: nowrap;
}
.cc-channel.is-auto {
  background: rgba(99, 102, 241, 0.24) !important;
  color: #c7d2fe !important;
}

.cc-domain {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 92px;
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: var(--link);
  text-decoration: none;
}
.cc-domain:hover {
  text-decoration: underline;
}

.cc-type {
  background: rgba(99, 102, 241, 0.22) !important;
  color: #c7d2fe !important;
  font-size: 10px !important;
  flex: none;
  white-space: nowrap;
}

.cc-len {
  font-size: 10.5px;
  color: var(--dim);
  font-variant-numeric: tabular-nums;
  flex: none;
  white-space: nowrap;
}

.cc-act {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--sub);
  cursor: pointer;
  opacity: 0;
  transition:
    opacity 0.15s ease,
    background 0.15s ease,
    color 0.15s ease;
}
.clip-card:hover .cc-act,
.cc-act:focus-visible {
  opacity: 1;
}
.cc-act:hover {
  background: var(--panel);
  color: var(--txt);
}
.cc-act.danger:hover {
  background: rgba(244, 63, 94, 0.18);
  color: #fb7185;
}
@media (hover: none) {
  .cc-act {
    opacity: 1;
  }
}
</style>
