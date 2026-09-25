<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import AppShell from '@/components/AppShell.vue';
import Toasts from '@/components/Toasts.vue';
import { useSession } from '@/stores/session';

const route = useRoute();
const session = useSession();
const bare = computed(() => Boolean(route.meta.public) || !session.isAuthenticated);
</script>

<template>
  <div v-if="!session.ready" class="loading">Memuat sesi…</div>
  <RouterView v-else-if="bare" />
  <AppShell v-else><RouterView /></AppShell>
  <Toasts />
</template>
