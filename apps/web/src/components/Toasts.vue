<script setup lang="ts">
import Icon from './Icon.vue';
import { useToast } from '@/stores/toast';
const toast = useToast();
</script>

<template>
  <div class="toasts" aria-live="polite" aria-atomic="false">
    <div v-for="t in toast.items" :key="t.id" class="toast" role="status" :data-tone="t.tone !== 'accent' ? t.tone : undefined">
      <span class="wl-icon" :data-tone="t.tone"><Icon :name="t.tone === 'danger' ? 'alert' : 'check'" /></span>
      <span class="toast-body"><span class="toast-title">{{ t.title }}</span><span v-if="t.note" class="toast-note">{{ t.note }}</span></span>
      <button class="btn btn-sm btn-icon btn-ghost" aria-label="Tutup pemberitahuan" @click="toast.dismiss(t.id)"><Icon name="x" /></button>
    </div>
  </div>
</template>
