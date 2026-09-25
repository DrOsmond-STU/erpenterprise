<script setup lang="ts">
import { useSession } from '@/stores/session';
const session = useSession();
</script>

<template>
  <div class="page-head"><div class="page-head-text"><h1 class="page-title">Belum ada modul yang dapat dibuka</h1><p class="page-sub">Akun {{ session.user?.email }} belum memiliki izin untuk halaman yang tersedia pada rilis ini. Hubungi admin sistem untuk penugasan peran.</p></div></div>
  <article class="card"><div class="card-body"><p class="card-note">Izin efektif: {{ session.user?.permissions.join(', ') || '—' }}</p></div></article>
</template>
