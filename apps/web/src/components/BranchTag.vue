<script setup lang="ts">
import { useContext } from '@/stores/context';
const ctx = useContext();
defineProps<{ code: string }>();
</script>

<template>
  <span class="branch-tag" :title="ctx.nameOf(code)">{{ ctx.shortOf(code) }}</span>
</template>
