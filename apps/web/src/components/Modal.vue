<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import Icon from './Icon.vue';
const emit = defineEmits<{ close: [] }>();
defineProps<{ title: string; subtitle?: string; width?: string }>();
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close'); };
onMounted(() => document.addEventListener('keydown', onKey));
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div class="scrim" @click="emit('close')"></div>
    <div class="modal" role="dialog" aria-modal="true" :aria-label="title" :style="width ? `max-width:${width}` : ''">
      <header class="modal-head">
        <div style="flex:1 1 auto">
          <h2 class="modal-title">{{ title }}</h2>
          <span v-if="subtitle" class="card-note">{{ subtitle }}</span>
        </div>
        <button class="btn btn-icon btn-ghost" aria-label="Tutup" @click="emit('close')"><Icon name="x" /></button>
      </header>
      <div class="modal-body"><slot /></div>
      <footer class="modal-foot"><slot name="foot" /></footer>
    </div>
  </Teleport>
</template>
