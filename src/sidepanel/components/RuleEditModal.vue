<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  NAlert,
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NForm,
  NFormItem,
  NIcon,
  NInput,
  NInputNumber,
  NModal,
  NRadioButton,
  NRadioGroup,
  NSpin,
  NSwitch,
  useMessage,
} from 'naive-ui'
import { FlaskOutline } from '@vicons/ionicons5'
import type { AutoCaptureRule, TestRuleResult } from '../../auto-capture/types'
import { TEST_PREVIEW_LIMIT } from '../../auto-capture/constants'
import { validateRegex } from '../../auto-capture/regex'
import { blankDraft, draftFromRule, useRulesStore, type RuleFormDraft } from '../../stores/rules'

const props = defineProps<{
  show: boolean
  rule: AutoCaptureRule | null
}>()
const emit = defineEmits<{ (e: 'update:show', v: boolean): void; (e: 'saved'): void }>()

const message = useMessage()
const rulesStore = useRulesStore()
const form = ref<RuleFormDraft>(blankDraft())
const saving = ref(false)

/** 触发条件 checkbox 组与 triggers 对象的双向映射 */
const triggerKeys = computed<string[]>({
  get: () =>
    Object.entries(form.value.triggers)
      .filter(([, v]) => v)
      .map(([k]) => k),
  set: (keys) => {
    form.value.triggers.pageLoad = keys.includes('pageLoad')
    form.value.triggers.spaNavigation = keys.includes('spaNavigation')
    form.value.triggers.domChange = keys.includes('domChange')
  },
})

// ---------- 测试器状态 ----------
type TestState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | {
      phase: 'success'
      url: string
      charCount: number
      durationMs: number
      totalMatches: number
      matches: { content: string }[]
    }
  | { phase: 'fail'; title: string; detail?: string }

const test = ref<TestState>({ phase: 'idle' })

watch(
  () => props.show,
  (show) => {
    if (!show) return
    form.value = props.rule ? draftFromRule(props.rule) : blankDraft()
    test.value = { phase: 'idle' }
    saving.value = false
  },
)

function close(): void {
  emit('update:show', false)
}

// ---------- 校验 ----------
const regexCheck = computed(() => validateRegex(form.value.regex, form.value.flags))
const urlRegexCheck = computed(() =>
  form.value.urlType === 'regex' && form.value.urlValue.trim()
    ? validateRegex(form.value.urlValue, '')
    : form.value.urlType === 'regex'
      ? { valid: false, error: 'URL 正则不能为空' }
      : { valid: true as const },
)
const canSave = computed(
  () => regexCheck.value.valid && urlRegexCheck.value.valid && form.value.name.trim().length > 0,
)

function buildDraftRule(): AutoCaptureRule {
  return {
    id: props.rule?.id ?? '__draft__',
    name: form.value.name.trim() || '草稿规则',
    enabled: true,
    urlCondition:
      form.value.urlType === 'all'
        ? { type: 'all', value: '*' }
        : { type: form.value.urlType, value: form.value.urlValue },
    pattern: {
      regex: form.value.regex,
      flags: form.value.flags.replace(/[^gimsuy]/g, ''),
      captureGroup: Math.max(0, Math.min(9, Math.floor(form.value.captureGroup || 0))),
    },
    triggers: { ...form.value.triggers },
    deduplication: { ...form.value.deduplication },
    scope: { type: 'page' },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
}

async function runTest(): Promise<void> {
  if (!regexCheck.value.valid) {
    test.value = { phase: 'fail', title: '正则错误', detail: regexCheck.value.error }
    return
  }
  test.value = { phase: 'running' }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) throw new Error('no-active-tab')
    // 草稿规则直接发送给 Content Script，不要求先保存
    const result = (await chrome.tabs.sendMessage(tab.id, {
      type: 'TEST_AUTO_RULE',
      rule: buildDraftRule(),
    })) as TestRuleResult | undefined
    if (!result) throw new Error('empty-response')
    if (result.ok) {
      test.value = {
        phase: 'success',
        url: result.url,
        charCount: result.charCount,
        durationMs: result.durationMs,
        totalMatches: result.totalMatches,
        matches: result.matches.map((m) => ({ content: m.content })),
      }
    } else if (result.reason === 'url-mismatch') {
      test.value = { phase: 'fail', title: '当前 URL 不符合规则', detail: result.url }
    } else if (result.reason === 'invalid-regex') {
      test.value = { phase: 'fail', title: '正则错误', detail: result.error }
    } else if (result.reason === 'no-text') {
      test.value = { phase: 'fail', title: '页面没有可见文本', detail: result.url }
    } else {
      test.value = { phase: 'fail', title: '执行失败', detail: result.error }
    }
  } catch {
    // chrome:// 等受限页面未注入 Content Script，sendMessage 会 reject
    test.value = {
      phase: 'fail',
      title: '当前网页无法注入 Content Script',
      detail: '浏览器内部页面、Chrome Web Store 或受限制站点不支持自动采集。',
    }
  }
}

async function save(): Promise<void> {
  if (!canSave.value || saving.value) return
  saving.value = true
  try {
    await rulesStore.saveFromDraft(form.value, props.rule)
    message.success(props.rule ? '规则已更新，已通知打开中的页面' : '规则已创建')
    emit('saved')
    close()
  } catch (err) {
    message.error(err instanceof Error ? err.message : '保存失败')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    :title="rule ? '编辑自动采集规则' : '新建自动采集规则'"
    :style="{ width: '96%' }"
    @update:show="(v: boolean) => (v ? null : close())"
  >
    <div class="rule-form">
      <n-form label-placement="top" size="small" :show-feedback="false">
        <n-form-item label="规则名称" required>
          <n-input v-model:value="form.name" placeholder="例如：提取错误日志" />
        </n-form-item>

        <n-form-item label="匹配网址" class="mt8">
          <n-radio-group v-model:value="form.urlType" size="small">
            <n-radio-button value="all">所有页面</n-radio-button>
            <n-radio-button value="wildcard">Wildcard</n-radio-button>
            <n-radio-button value="regex">URL 正则</n-radio-button>
          </n-radio-group>
        </n-form-item>
        <n-form-item
          v-if="form.urlType !== 'all'"
          class="mt4"
          :validation-status="urlRegexCheck.valid ? undefined : 'error'"
          :feedback="urlRegexCheck.error"
        >
          <n-input
            v-model:value="form.urlValue"
            :placeholder="
              form.urlType === 'wildcard'
                ? 'https://example.com/*   （* 匹配任意字符）'
                : 'https://example\\.com/logs/.*'
            "
          />
        </n-form-item>

        <n-form-item
          label="内容正则"
          required
          class="mt8"
          :validation-status="regexCheck.valid ? undefined : 'error'"
          :feedback="regexCheck.error"
        >
          <n-input v-model:value="form.regex" placeholder="ERROR\\s+(.+)" />
        </n-form-item>

        <div class="field-row mt4">
          <div class="flags-field">
            <span class="field-label">Flags</span>
            <n-input v-model:value="form.flags" placeholder="gi" class="flags-input" />
          </div>
          <div class="group-field">
            <span class="field-label">保存内容</span>
            <div class="group-row">
              <n-radio-group v-model:value="form.captureGroup" size="small">
                <n-radio-button :value="0">$0</n-radio-button>
                <n-radio-button :value="1">$1</n-radio-button>
                <n-radio-button :value="2">$2</n-radio-button>
              </n-radio-group>
              <n-input-number
                v-if="form.captureGroup > 2"
                v-model:value="form.captureGroup"
                size="tiny"
                :min="3"
                :max="9"
                style="width: 76px"
              />
            </div>
          </div>
        </div>

        <n-form-item label="触发条件" class="mt8" :show-feedback="false">
          <n-checkbox-group v-model:value="triggerKeys">
            <n-checkbox value="pageLoad">加载 / 刷新</n-checkbox>
            <n-checkbox value="spaNavigation">SPA 切换</n-checkbox>
            <n-checkbox value="domChange">动态变化</n-checkbox>
          </n-checkbox-group>
        </n-form-item>

        <div class="field-row dedup-row mt8">
          <div class="dedup-switch">
            <span class="field-label">去重</span>
            <n-switch v-model:value="form.deduplication.enabled" size="small" />
          </div>
          <n-radio-group
            v-if="form.deduplication.enabled"
            v-model:value="form.deduplication.scope"
            size="small"
          >
            <n-radio-button value="page">当前页面</n-radio-button>
            <n-radio-button value="global">全局</n-radio-button>
          </n-radio-group>
        </div>
      </n-form>

      <!-- 测试器 -->
      <div class="test-area">
        <n-button size="small" tertiary :disabled="test.phase === 'running'" @click="runTest">
          <template #icon><n-icon :component="FlaskOutline" /></template>
          测试规则
        </n-button>

        <n-spin v-if="test.phase === 'running'" size="small" style="margin-top: 10px" />

        <n-alert v-if="test.phase === 'fail'" type="error" style="margin-top: 10px" :bordered="false">
          <b>{{ test.title }}</b>
          <div v-if="test.detail" class="fail-detail">{{ test.detail }}</div>
        </n-alert>

        <div v-if="test.phase === 'success'" class="glass test-result">
          <div class="tr-meta">
            <span class="tr-url">{{ test.url }}</span>
            <span>扫描 {{ test.charCount.toLocaleString() }} 字符 · {{ test.durationMs }}ms</span>
          </div>
          <p class="tr-count">
            匹配到 <b>{{ test.totalMatches }}</b> 条<template
              v-if="test.totalMatches > TEST_PREVIEW_LIMIT"
            >
              ，仅展示前 {{ TEST_PREVIEW_LIMIT }} 条</template
            >
          </p>
          <ol v-if="test.matches.length" class="tr-list">
            <li v-for="(m, i) in test.matches" :key="i">{{ m.content }}</li>
          </ol>
          <p v-else class="tr-empty">未匹配到任何内容</p>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="modal-actions">
        <n-button size="small" quaternary @click="close">取消</n-button>
        <n-button size="small" type="primary" :disabled="!canSave" :loading="saving" @click="save">
          保存
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.rule-form {
  display: flex;
  flex-direction: column;
}
.mt4 {
  margin-top: 4px;
}
.mt8 {
  margin-top: 8px;
}

.field-row {
  display: flex;
  align-items: flex-end;
  gap: 12px;
}
.flags-field,
.group-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field-label {
  font-size: 11px;
  color: var(--sub);
}
.flags-input {
  width: 90px;
}
.group-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.dedup-row {
  justify-content: space-between;
}
.dedup-switch {
  display: flex;
  align-items: center;
  gap: 8px;
}

.test-area {
  margin-top: 14px;
  padding-top: 10px;
  border-top: 1px dashed rgba(148, 163, 184, 0.18);
}
.fail-detail {
  margin-top: 4px;
  font-size: 11.5px;
  word-break: break-all;
  color: #fda4af;
}
.test-result {
  margin-top: 10px;
  padding: 10px 12px;
}
.tr-meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--sub);
}
.tr-url {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tr-count {
  margin: 8px 0 6px;
  font-size: 12px;
  color: var(--txt-body);
}
.tr-list {
  margin: 0;
  padding-left: 22px;
  max-height: 220px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.7;
  color: var(--txt);
  word-break: break-all;
  white-space: pre-wrap;
}
.tr-empty {
  margin: 0;
  font-size: 12px;
  color: var(--dim);
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
