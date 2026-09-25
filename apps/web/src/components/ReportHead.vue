<script setup lang="ts">
import Icon from './Icon.vue';
import { useContext } from '@/stores/context';
const ctx = useContext();
defineProps<{ title: string; sub?: string }>();
</script>

<template>
  <div class="page-head">
    <div class="page-head-text">
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="sub" class="page-sub">{{ sub }}</p>
    </div>
    <div class="page-actions">
      <span class="ctx-chip"><Icon name="map-pin" /> {{ ctx.branchName }}</span>
      <span class="ctx-chip"><Icon name="calendar" /> {{ ctx.periodLabel }}</span>
      <slot />
    </div>
  </div>
</template>
