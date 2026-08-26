<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { NButton, NIcon, NPopconfirm, NSwitch, useMessage } from 'naive-ui'
import {
  CloudUploadOutline,
  DownloadOutline,
  ServerOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import * as db from '../../database/indexeddb'
import { buildDocument } from '../../utils/markdown'
import type { ExportBundle } from '../../types'
import { useClipsStore } from '../../stores/clips'
import { useWorkspaceStore } from '../../stores/workspace'
import { usePrefsStore } from '../../stores/prefs'

const clips = useClipsStore()
const ws = useWorkspaceStore()
const prefs = usePrefsStore()
const message = useMessage()

const stats = ref({ clips: 0, collections: 0, usage: '…' })

async function refreshStats(): Promise<void> {
  stats.value.clips = await db.countClips()
  stats.value.collections = (await db.listCollections()).length
  try {
    const est = await navigator.storage.estimate()
    const mb = (est.usage ?? 0) / 1048576
    stats.value.usage = mb < 1 ? '< 1 MB' : `${mb.toFixed(1)} MB`
  } catch {
    stats.value.usage = '-'
  }
}

onMounted(() => {
  void prefs.loadAll()
  void refreshStats()
})

// ---------- 导出 ----------
function download(name: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

const stamp = (): string =>
  new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')

async function exportJson(): Promise<void> {
  const bundle = await db.exportAll()
  download(
    `clipflow-${stamp()}.json`,
    JSON.stringify(bundle, null, 2),
    'application/json',
  )
  message.success(`已导出 ${bundle.clips.length} 条剪藏`)
}

async function exportMarkdown(): Promise<void> {
  const all = await db.listClips({ limit: 1_000_000 })
  download(
    `clipflow-${stamp()}.md`,
    buildDocument({ title: 'ClipFlow Collection', clips: all }),
    'text/markdown',
  )
  message.success(`已导出 ${all.length} 条为 Markdown`)
}

// ---------- 导入 ----------
const fileInput = ref<HTMLInputElement | null>(null)

async function onImportFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const parsed = JSON.parse(await file.text()) as Partial<ExportBundle>
    if (!parsed || !Array.isArray(parsed.clips)) {
      throw new Error('文件格式不正确：缺少 clips 数组')
    }
    const res = await db.importBundle(parsed)
    await Promise.all([clips.init(), ws.loadAll(), refreshStats()])
    message.success(`导入完成：新增 ${res.added} 条，跳过 ${res.skipped} 条无效/重复项`)
  } catch (err) {
    message.error(err instanceof Error ? err.message : '导入失败：无法解析该文件')
  }
}

// ---------- 危险区 ----------
async function clearEverything(): Promise<void> {
  await db.clearClips()
  // 同步清空各工作台中已失效的条目引用
  const cols = await db.listCollections()
  await Promise.all(
    cols
      .filter((c) => c.clips.length > 0)
      .map((c) => db.saveCollection({ ...c, clips: [] })),
  )
  await Promise.all([clips.init(), ws.loadAll(), refreshStats()])
  message.success('已清空全部剪藏数据')
}
</script>

<template>
  <section class="page">
    <div class="clip-scroll settings-scroll">
      <!-- 通用 -->
      <div class="glass section">
        <h3 class="sec-title">通用</h3>
        <div class="pref-row">
          <div class="pref-text">
            <span>选中文字后自动记录</span>
            <p>
              覆盖浏览器“划词自动复制”等场景：选区稳定后自动加入剪藏，
              稳定期间按 Ctrl+C 不会产生重复条目。
            </p>
          </div>
          <n-switch
            size="small"
            :value="prefs.prefs.selectionAutoCapture"
            @update:value="(v: boolean) => prefs.update({ selectionAutoCapture: v })"
          />
        </div>
      </div>

      <!-- 数据统计 -->
      <div class="glass section">
        <h3 class="sec-title">
          <n-icon size="14" :component="ServerOutline" /> 数据统计
        </h3>
        <div class="stat-grid">
          <div class="stat">
            <span class="stat-num">{{ stats.clips }}</span>
            <span class="stat-label">剪藏总数</span>
          </div>
          <div class="stat">
            <span class="stat-num">{{ stats.collections }}</span>
            <span class="stat-label">工作台</span>
          </div>
          <div class="stat">
            <span class="stat-num">{{ stats.usage }}</span>
            <span class="stat-label">本地占用</span>
          </div>
        </div>
      </div>

      <!-- 导入导出 -->
      <div class="glass section">
        <h3 class="sec-title">导入 / 导出</h3>
        <p class="sec-desc">
          导出包含全部剪藏与工作台；导入 JSON 会自动跳过冲突 ID 并重新编号。
        </p>
        <div class="btn-row">
          <n-button size="small" secondary @click="exportJson">
            <template #icon><n-icon :component="DownloadOutline" /></template>
            导出 JSON
          </n-button>
          <n-button size="small" secondary @click="exportMarkdown">
            <template #icon><n-icon :component="DownloadOutline" /></template>
            导出 Markdown
          </n-button>
          <n-button size="small" secondary @click="fileInput?.click()">
            <template #icon><n-icon :component="CloudUploadOutline" /></template>
            导入 JSON
          </n-button>
          <input
            ref="fileInput"
            type="file"
            accept="application/json,.json"
            class="hidden-input"
            @change="onImportFile"
          />
        </div>
      </div>

      <!-- 危险区 -->
      <div class="glass section danger-section">
        <h3 class="sec-title danger-title">危险操作</h3>
        <div class="btn-row">
          <n-popconfirm :show-icon="false" @positive-click="clearEverything">
            <template #trigger>
              <n-button size="small" type="error" secondary>
                <template #icon><n-icon :component="TrashOutline" /></template>
                清空全部剪藏
              </n-button>
            </template>
            将永久删除全部剪藏数据，且无法恢复。确定继续？
          </n-popconfirm>
        </div>
      </div>

      <!-- 关于 -->
      <div class="glass section about">
        <h3 class="sec-title">关于 ClipFlow</h3>
        <ul class="about-list">
          <li>版本 v0.1.0 · 本地优先，所有数据仅保存在浏览器 IndexedDB，不上传任何服务器。</li>
          <li>快捷键：<kbd>Alt+Shift+F</kbd> 打开侧边栏；<kbd>Alt+Shift+C</kbd> 聚焦面板。可在 <code>chrome://extensions/shortcuts</code> 修改。</li>
          <li>复制即记录：插件只读取你主动复制的文本选区，不监听系统剪贴板。</li>
          <li>AI 能力（总结 / Prompt 生成 / 本地 LLM）已预留数据结构，将在后续版本提供。</li>
        </ul>
      </div>
    </div>
  </section>
</template>

<style scoped>
.settings-scroll {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 12px;
}

.section {
  padding: 12px 14px;
}

.sec-title {
  margin: 0 0 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--txt);
}
.sec-desc {
  margin: -2px 0 10px;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--sub);
}

.pref-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.pref-text {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 12px;
  color: var(--txt);
}
.pref-text p {
  margin: 4px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--sub);
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 10px 4px;
  border-radius: 10px;
  background: var(--panel);
}
.stat-num {
  font-size: 17px;
  font-weight: 700;
  color: var(--accent-soft);
  font-variant-numeric: tabular-nums;
}
.stat-label {
  font-size: 11px;
  color: var(--dim);
}

.btn-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.hidden-input {
  display: none;
}

.danger-section {
  border-color: rgba(244, 63, 94, 0.25);
}
.danger-title {
  color: #fb7185;
}

.about-list {
  margin: 0;
  padding-left: 16px;
  font-size: 11.5px;
  line-height: 1.9;
  color: var(--sub);
}
.about-list kbd,
.about-list code {
  background: var(--panel);
  border-radius: 4px;
  padding: 1px 5px;
  font-size: 10.5px;
  color: var(--txt-body);
}
</style>
