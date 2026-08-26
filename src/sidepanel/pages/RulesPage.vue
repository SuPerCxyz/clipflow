<script setup lang="ts">
import { onMounted } from 'vue'
import { NButton, NIcon, useMessage } from 'naive-ui'
import { AddOutline, GitBranchOutline } from '@vicons/ionicons5'
import type { AutoCaptureRule } from '../../auto-capture/types'
import { useRulesStore } from '../../stores/rules'
import { useUiStore } from '../../stores/ui'
import RuleCard from '../components/RuleCard.vue'
import EmptyState from '../components/EmptyState.vue'

const rulesStore = useRulesStore()
const ui = useUiStore()
const message = useMessage()

onMounted(() => {
  void rulesStore.loadAll()
})

function openCreate(): void {
  ui.openRuleEditor(null)
}

function openEdit(rule: AutoCaptureRule): void {
  ui.openRuleEditor(rule)
}
</script>

<template>
  <section class="page">
    <div class="rules-toolbar">
      <span class="total">自动采集规则</span>
      <span class="flex-spacer" />
      <n-button size="tiny" type="primary" @click="openCreate">
        <template #icon><n-icon :component="AddOutline" /></template>
        新建规则
      </n-button>
    </div>

    <div class="clip-scroll">
      <div class="rules-list">
        <RuleCard
          v-for="rule in rulesStore.rules"
          :key="rule.id"
          :rule="rule"
          @edit="openEdit(rule)"
          @toggle="rulesStore.toggle(rule.id)"
          @duplicate="rulesStore.duplicate(rule.id)"
          @remove="
            () => {
              void rulesStore.remove(rule.id).then(() => message.success('规则已删除，历史记录已保留'))
            }
          "
          @test="openEdit(rule)"
        />
      </div>

      <EmptyState
        v-if="rulesStore.loaded && !rulesStore.rules.length"
        title="还没有自动采集规则"
        description='创建一条「URL 条件 + 正则」规则，例如匹配 https://example.com/* 提取 ERROR 行。页面内容命中后无需 Ctrl+C 即可自动入库。'
      >
        <template #icon>
          <n-icon size="22" :component="GitBranchOutline" />
        </template>
        <n-button size="small" type="primary" @click="openCreate">新建第一条规则</n-button>
      </EmptyState>
    </div>

    <footer class="page-footer">
      <span class="total">{{ rulesStore.rules.length }} 条规则 · {{ rulesStore.rules.filter(r => r.enabled).length }} 条启用中</span>
    </footer>
  </section>
</template>

<style scoped>
.rules-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  row-gap: 6px;
  gap: 8px;
  padding: 10px 12px 2px;
}
.rules-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
