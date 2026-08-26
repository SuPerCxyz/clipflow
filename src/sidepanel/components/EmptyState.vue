<script setup lang="ts">
defineProps<{
  icon?: unknown
  title: string
  description?: string
}>()
</script>

<template>
  <div class="empty glass">
    <div class="empty-icon">
      <slot name="icon" />
    </div>
    <p class="empty-title">{{ title }}</p>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <div class="empty-action">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin: 32px auto 0;
  padding: 26px 20px;
  max-width: 300px;
  text-align: center;
}
.empty-icon {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.25), rgba(14, 165, 233, 0.18));
  color: var(--accent-soft);
  margin-bottom: 4px;
}
.empty-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--txt);
}
.empty-desc {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.6;
  color: var(--sub);
}
.empty-action {
  margin-top: 6px;
}
.empty-action:empty {
  display: none;
}
</style>
