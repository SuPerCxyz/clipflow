<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  NButton,
  NIcon,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSwitch,
  useMessage,
} from 'naive-ui'
import {
  AddOutline,
  CloseOutline,
  CopyOutline,
  CreateOutline,
  DocumentTextOutline,
  MenuOutline,
} from '@vicons/ionicons5'
import type { ClipItem } from '../../types'
import { timeAgo } from '../../utils/format'
import { useWorkspaceStore } from '../../stores/workspace'
import { useUiStore } from '../../stores/ui'
import EmptyState from '../components/EmptyState.vue'

const ws = useWorkspaceStore()
const ui = useUiStore()
const message = useMessage()

const colOptions = computed(() =>
  ws.collections.map((c) => ({ label: `${c.title} (${c.clips.length})`, value: c.id })),
)

// ---- 新建工作台 ----
const creating = ref(false)
const newTitle = ref('')
async function confirmCreate(): Promise<void> {
  const title = newTitle.value.trim()
  creating.value = false
  if (!title) return
  await ws.create(title)
  newTitle.value = ''
  message.success('工作台已创建')
}

// ---- 重命名工作台 ----
const renaming = ref(false)
const renameTitle = ref('')
function startRename(): void {
  if (!ws.active) return
  renameTitle.value = ws.active.title
  renaming.value = true
}
async function confirmRename(): Promise<void> {
  const id = ws.activeId
  renaming.value = false
  if (id) await ws.rename(id, renameTitle.value)
}

// ---- 拖拽排序 ----
let dragIndex = -1
function onDragStart(i: number, e: DragEvent): void {
  dragIndex = i
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'
}
function onDragOver(e: DragEvent): void {
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
  e.preventDefault()
}
function onDrop(i: number, e: DragEvent): void {
  e.preventDefault()
  if (dragIndex >= 0 && dragIndex !== i) void ws.move(dragIndex, i)
  dragIndex = -1
}

function editClip(clip: ClipItem): void {
  ui.openEditor(clip)
}

async function removeAt(i: number): Promise<void> {
  await ws.removeAt(i)
}

async function copyMerged(): Promise<void> {
  ;(await ws.copyMerged())
    ? message.success(`已复制 ${ws.clips.length} 条内容`)
    : message.error('暂无内容可复制')
}

async function copyDetailed(): Promise<void> {
  ;(await ws.copyMergedDetailed())
    ? message.success(`已复制 ${ws.clips.length} 条（Markdown 含来源）`)
    : message.error('暂无内容可复制')
}

async function clearAll(): Promise<void> {
  await ws.clear()
  message.success('已清空当前工作台')
}

async function delCol(): Promise<void> {
  const title = ws.active?.title
  await ws.removeCollection(ws.activeId)
  message.success(`已删除「${title}」（剪藏已保留）`)
}
</script>

<template>
  <section class="page">
    <div class="ws-toolbar">
      <n-select
        size="tiny"
        class="ws-select"
        :value="ws.activeId"
        :options="colOptions"
        placeholder="选择工作台"
        @update:value="(v: string) => ws.select(v)"
      />
      <n-button size="tiny" quaternary @click="creating = true">
        <n-icon :component="AddOutline" /> 新建
      </n-button>
      <n-button size="tiny" quaternary :disabled="!ws.activeId" @click="startRename">
        <n-icon :component="CreateOutline" /> 重命名
      </n-button>
    </div>

    <div class="ws-actions">
      <label class="preview-toggle">
        <n-switch v-model:value="ws.previewMode" size="small" />
        <span>预览</span>
      </label>
      <span class="flex-spacer" />
      <n-popconfirm :show-icon="false" @positive-click="clearAll">
        <template #trigger>
          <n-button size="tiny" quaternary :disabled="!ws.clips.length">清空</n-button>
        </template>
        清空当前工作台的全部条目？
      </n-popconfirm>
      <n-popconfirm :show-icon="false" @positive-click="delCol">
        <template #trigger>
          <n-button size="tiny" quaternary type="error" :disabled="!ws.activeId">
            删除工作台
          </n-button>
        </template>
        删除该工作台？（不会删除剪藏本身）
      </n-popconfirm>
      <n-button
        size="tiny"
        :disabled="!ws.clips.length"
        title="Markdown 格式：以工作台标题生成，含来源（与预览一致）"
        @click="copyDetailed"
      >
        <template #icon>
          <n-icon :component="DocumentTextOutline" />
        </template>
        详情
      </n-button>
      <n-button size="tiny" type="primary" :disabled="!ws.clips.length" title="仅复制原始内容，无任何附加信息" @click="copyMerged">
        <template #icon>
          <n-icon :component="CopyOutline" />
        </template>
        复制全部
      </n-button>
    </div>

    <!-- Markdown 合并预览 -->
    <div v-if="ws.previewMode" class="md-preview-wrap">
      <div class="md-body glass md-preview" v-html="ws.previewHtml"></div>
    </div>

    <!-- 工作台条目列表（可拖拽排序） -->
    <div v-else class="clip-scroll">
      <TransitionGroup name="clip" tag="div" class="ws-list">
        <div
          v-for="(clip, i) in ws.clips"
          :key="clip.id"
          class="ws-item glass"
          draggable="true"
          @dragstart="onDragStart(i, $event)"
          @dragover="onDragOver"
          @drop="onDrop(i, $event)"
        >
          <span class="ws-index">{{ i + 1 }}</span>
          <div class="ws-main" title="点击编辑内容" @click="editClip(clip)">
            <p class="ws-snippet">
              {{ clip.content.length > 90 ? clip.content.slice(0, 90) + ' …' : clip.content }}
            </p>
            <span class="ws-src">
              {{ clip.source.title || clip.source.url }} · {{ timeAgo(clip.createdAt) }}
            </span>
          </div>
          <button class="cc-act ws-remove" title="移出工作台" @click="removeAt(i)">
            <n-icon size="14" :component="CloseOutline" />
          </button>
          <span class="ws-handle" title="拖动排序">
            <n-icon size="15" :component="MenuOutline" />
          </span>
        </div>
      </TransitionGroup>

      <EmptyState
        v-if="!ws.clips.length"
        title="工作台还是空的"
        description="在「剪藏」列表中点击 ➕ 将内容加入当前工作台，支持拖动排序、编辑与一键合并。"
      >
        <template #icon>
          <n-icon size="22" :component="DocumentTextOutline" />
        </template>
      </EmptyState>
    </div>

    <footer class="page-footer">
      <span class="total">{{ ws.clips.length }} 条 · {{ ws.collections.length }} 个工作台</span>
    </footer>

    <!-- 新建 / 重命名弹窗 -->
    <n-modal
      :show="creating"
      preset="card"
      title="新建工作台"
      :style="{ width: '86%' }"
      @update:show="(v: boolean) => (creating = v)"
    >
      <n-input
        v-model:value="newTitle"
        placeholder="例如：OpenStack RabbitMQ 分析"
        autofocus
        @keyup.enter="confirmCreate"
      />
      <template #footer>
        <div class="modal-actions">
          <n-button size="small" quaternary @click="creating = false">取消</n-button>
          <n-button size="small" type="primary" @click="confirmCreate">创建</n-button>
        </div>
      </template>
    </n-modal>

    <n-modal
      :show="renaming"
      preset="card"
      title="重命名工作台"
      :style="{ width: '86%' }"
      @update:show="(v: boolean) => (renaming = v)"
    >
      <n-input v-model:value="renameTitle" autofocus @keyup.enter="confirmRename" />
      <template #footer>
        <div class="modal-actions">
          <n-button size="small" quaternary @click="renaming = false">取消</n-button>
          <n-button size="small" type="primary" @click="confirmRename">保存</n-button>
        </div>
      </template>
    </n-modal>
  </section>
</template>

<style scoped>
.ws-toolbar,
.ws-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px 4px;
}
.ws-actions {
  flex-wrap: wrap;
  row-gap: 6px;
  padding-top: 2px;
  padding-bottom: 6px;
}
.ws-select {
  max-width: 170px;
}
.preview-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--sub);
  cursor: pointer;
  user-select: none;
}

.md-preview-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 12px 16px;
}
.md-preview {
  padding: 12px 14px;
  min-height: 100%;
}

.ws-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  cursor: grab;
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}
.ws-item:hover {
  border-color: rgba(99, 102, 241, 0.45);
  box-shadow: 0 3px 14px rgba(2, 6, 23, 0.35);
}
.ws-item:active {
  cursor: grabbing;
}

.ws-index {
  flex: none;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: rgba(99, 102, 241, 0.2);
  color: #c7d2fe;
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.ws-main {
  flex: 1 1 auto;
  min-width: 0;
  cursor: pointer;
}
.ws-snippet {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: var(--txt-body);
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.ws-src {
  display: block;
  margin-top: 3px;
  font-size: 10.5px;
  color: var(--dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ws-handle {
  flex: none;
  color: var(--dim);
  display: inline-flex;
}
.ws-remove {
  opacity: 0;
}
.ws-item:hover .ws-remove {
  opacity: 1;
}
@media (hover: none) {
  .ws-remove {
    opacity: 1;
  }
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
  transition:
    background 0.15s ease,
    color 0.15s ease;
}
.cc-act:hover {
  background: var(--panel);
  color: var(--txt);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
