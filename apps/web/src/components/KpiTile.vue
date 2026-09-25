<script setup lang="ts">
defineProps<{ label: string; value: string; foot?: string; tone?: 'pos' | 'neg' | '' }>();
</script>

<template>
  <div class="kpi-tile">
    <span class="kpi-label">{{ label }}</span>
    <span class="kpi-value" :class="tone">{{ value }}</span>
    <span v-if="foot" class="kpi-foot">{{ foot }}</span>
    <slot />
  </div>
</template>
