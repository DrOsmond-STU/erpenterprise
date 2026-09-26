<script setup lang="ts">
/** Konfirmasi tindakan yang wajib beralasan (dicatat di jejak audit). Pengganti window.prompt. */
import { ref } from 'vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';

const props = withDefaults(defineProps<{ title: string; message?: string; confirmLabel?: string; danger?: boolean; busy?: boolean; error?: string }>(), { confirmLabel: 'Konfirmasi' });
const emit = defineEmits<{ close: []; confirm: [string] }>();
const reason = ref('');
const submit = () => { if (reason.value.trim().length >= 3 && !props.busy) emit('confirm', reason.value.trim()); };
</script>

<template>
  <Modal :title="title" :subtitle="message" width="480px" @close="emit('close')">
    <div class="field">
      <label for="reason-input">Alasan (dicatat di jejak audit)</label>
      <textarea id="reason-input" v-model="reason" class="textarea" rows="3" maxlength="300" placeholder="Minimal 3 karakter" @keydown.enter.ctrl="submit" />
    </div>
    <p v-if="error" class="field-hint neg" role="alert" style="margin-top:var(--sp-2)">{{ error }}</p>
    <template #foot>
      <button class="btn" :class="danger ? 'btn-danger' : 'btn-primary'" data-action="confirm-reason" :disabled="busy || reason.trim().length < 3" @click="submit"><Icon name="check" /> {{ confirmLabel }}</button>
      <div class="toolbar-spacer"></div>
      <button class="btn btn-ghost" @click="emit('close')">Batal</button>
    </template>
  </Modal>
</template>
