<script setup lang="ts">
/** Pilihan pusat biaya (opsional). Tidak tampil bila belum ada pusat biaya aktif atau pengguna tanpa akses. */
import { costCenterOptions } from '@/lib/cost-centers';

defineOptions({ inheritAttrs: false });
const model = defineModel<string>({ default: '' });
withDefaults(defineProps<{ id?: string; label?: string; compact?: boolean; empty?: string; currentLabel?: string }>(), { label: 'Pusat biaya (opsional)', empty: '— tanpa pusat biaya —', currentLabel: 'Pusat biaya saat ini (nonaktif)' });
const { options } = costCenterOptions();
</script>

<template>
  <template v-if="options.length || model">
    <select v-if="compact" v-model="model" class="select" :aria-label="label" data-field="cost-center" v-bind="$attrs">
      <option value="">{{ empty }}</option>
      <option v-if="model && !options.some((o) => o.id === model)" :value="model">{{ currentLabel }}</option>
      <option v-for="o in options" :key="o.id" :value="o.id">{{ o.code }} · {{ o.name }}</option>
    </select>
    <div v-else class="field" v-bind="$attrs">
      <label :for="id">{{ label }}</label>
      <select :id="id" v-model="model" class="select" data-field="cost-center">
        <option value="">{{ empty }}</option>
        <option v-if="model && !options.some((o) => o.id === model)" :value="model">{{ currentLabel }}</option>
        <option v-for="o in options" :key="o.id" :value="o.id">{{ o.code }} · {{ o.name }}</option>
      </select>
    </div>
  </template>
</template>
