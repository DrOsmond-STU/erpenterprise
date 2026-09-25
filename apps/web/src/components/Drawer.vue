<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import Icon from './Icon.vue';
const emit = defineEmits<{ close: [] }>();
defineProps<{ title: string; subtitle?: string }>();
const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close'); };
onMounted(() => document.addEventListener('keydown', onKey));
onUnmounted(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <Teleport to="body">
    <div class="scrim" @click="emit('close')"></div>
    <aside class="drawer" role="dialog" aria-modal="true" :aria-label="title">
      <header class="drawer-head">
        <div class="drawer-head-top">
          <div style="flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:var(--sp-2)">
            <div class="drawer-eyebrow"><slot name="eyebrow" /></div>
            <h2 class="drawer-title">{{ title }}</h2>
            <span v-if="subtitle" class="card-note">{{ subtitle }}</span>
          </div>
          <button class="btn btn-icon btn-ghost" aria-label="Tutup" @click="emit('close')"><Icon name="x" /></button>
        </div>
      </header>
      <div class="drawer-body"><slot /></div>
      <footer class="drawer-foot"><slot name="foot"><button class="btn btn-ghost" @click="emit('close')">Tutup</button></slot></footer>
    </aside>
  </Teleport>
</template>
