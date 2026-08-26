<script setup lang="ts">
import { ref, watch } from 'vue'
import { NButton, NInput, NModal, useMessage } from 'naive-ui'
import { useUiStore } from '../../stores/ui'
import { useClipsStore } from '../../stores/clips'

const ui = useUiStore()
const clips = useClipsStore()
const message = useMessage()

const draft = ref('')

watch(
  () => ui.showEdit,
  (show) => {
    draft.value = show && ui.editingClip ? ui.editingClip.content : ''
  },
)

function close(): void {
  ui.closeEditor()
}

async function save(): Promise<void> {
  if (!ui.editingClip) return
  if (!draft.value.trim()) {
    message.warning('内容不能为空')
    return
  }
  await clips.updateContent(ui.editingClip.id, draft.value)
  message.success('已保存')
  close()
}
</script>

<template>
  <n-modal
    :show="ui.showEdit"
    preset="card"
    title="编辑剪藏"
    :style="{ width: '94%' }"
    :mask-closable="true"
    @update:show="(v: boolean) => (v ? null : close())"
  >
    <n-input
      v-model:value="draft"
      type="textarea"
      placeholder="编辑复制内容…"
      :autosize="{ minRows: 8, maxRows: 18 }"
    />
    <template #footer>
      <div class="modal-actions">
        <n-button size="small" quaternary @click="close">取消</n-button>
        <n-button size="small" type="primary" @click="save">保存</n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
