<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Icon from './Icon.vue';
import { NAV } from '@/router';
import { useContext } from '@/stores/context';
import { useSession } from '@/stores/session';
import { useToast } from '@/stores/toast';

const route = useRoute();
const router = useRouter();
const session = useSession();
const ctx = useContext();
const toast = useToast();

ctx.reconcile();
watch(() => session.user, () => ctx.reconcile());

const nav = computed(() => NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || session.can(i.permission)) })).filter((g) => g.items.length));
const currentTitle = computed(() => String(route.meta.title ?? 'Halaman'));
const currentGroup = computed(() => NAV.find((g) => g.items.some((i) => i.path === route.path))?.label ?? '');
const initials = computed(() => (session.user?.name ?? '?').split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase());

const openMenu = ref<'branch' | 'period' | 'user' | null>(null);
const toggle = (m: 'branch' | 'period' | 'user') => { openMenu.value = openMenu.value === m ? null : m; };
const close = () => { openMenu.value = null; };

function setBranch(code: string) {
  ctx.branch = code; close();
  toast.push('Cabang aktif diubah', `${ctx.nameOf(code)} — register, dasbor, dan laporan mengikuti konteks ini.`, 'ok');
}
function setPeriod(id: string) {
  ctx.period = id; close();
  const p = session.periods.find((x) => x.id === id);
  toast.push('Periode diubah', `${p?.label}${p?.status === 'closed' ? ' · periode sudah ditutup (hanya baca)' : ''}`, 'ok');
}
async function logout() { close(); await session.logout(); router.push('/masuk'); }
const months = computed(() => session.periods.filter((p) => p.group === 'Bulan'));
const others = computed(() => session.periods.filter((p) => p.group !== 'Bulan'));
</script>

<template>
  <div class="app" id="app-shell" :data-rail="ctx.railCollapsed ? 'collapsed' : 'expanded'" @keydown.esc="close">
    <nav class="rail" aria-label="Navigasi utama">
      <div class="rail-brand">
        <span class="rail-mark"><Icon name="boxes" /></span>
        <span class="rail-wordmark"><b>ERP Enterprise</b><span>{{ session.company?.name?.replace(/^PT /, '') ?? '' }}</span></span>
      </div>
      <div class="rail-scroll">
        <div v-for="g in nav" :key="g.label" class="rail-group">
          <div class="rail-group-label">{{ g.label }}</div>
          <RouterLink v-for="it in g.items" :key="it.path" :to="it.path" custom v-slot="{ navigate, isActive }">
            <button class="rail-link" :aria-current="isActive ? 'page' : undefined" :title="it.label" @click="navigate">
              <Icon :name="it.icon" cls="rail-link-icon" /><span class="rail-link-text">{{ it.label }}</span>
            </button>
          </RouterLink>
        </div>
      </div>
      <div class="rail-foot">
        <button class="rail-link" title="Lebarkan atau ciutkan navigasi" @click="ctx.railCollapsed = !ctx.railCollapsed">
          <Icon name="panel" cls="rail-link-icon" /><span class="rail-link-text">Ciutkan panel</span>
        </button>
      </div>
    </nav>

    <div class="main">
      <header class="topbar">
        <div class="crumbs">
          <template v-if="currentGroup"><span class="crumbs-trail">{{ currentGroup }}</span><span class="crumbs-sep crumbs-trail">/</span></template>
          <b>{{ currentTitle }}</b>
        </div>
        <div class="topbar-spacer"></div>
        <div class="topbar-user">
          <button class="btn btn-icon btn-ghost" aria-label="Menu pengguna" @click="toggle('user')"><span class="avatar">{{ initials }}</span></button>
          <div v-if="openMenu === 'user'" class="user-menu" role="menu">
            <div class="popover-head">
              <span class="avatar avatar-lg">{{ initials }}</span>
              <div class="card-head-text"><span class="card-title">{{ session.user?.name }}</span><span class="card-note">{{ session.user?.email }}</span></div>
            </div>
            <div class="menu">
              <div class="palette-group-label">Tema</div>
              <button v-for="t in (['light','dark','system'] as const)" :key="t" class="menu-item" role="menuitemradio" :aria-checked="ctx.theme === t" @click="ctx.theme = t; close()">
                <Icon :name="t === 'light' ? 'sun' : t === 'dark' ? 'moon' : 'monitor'" /><span style="flex:1">{{ t === 'light' ? 'Terang' : t === 'dark' ? 'Gelap' : 'Ikuti sistem' }}</span><Icon v-if="ctx.theme === t" name="check" />
              </button>
              <div class="menu-sep"></div>
              <button class="menu-item" @click="logout"><Icon name="logout" /> Keluar</button>
            </div>
          </div>
        </div>
      </header>

      <div class="contextbar">
        <div class="ctx-field">
          <span class="micro">Perusahaan</span>
          <span class="ctx-static">{{ session.company?.name }}</span>
        </div>
        <div class="ctx-field">
          <span class="micro">Cabang</span>
          <button class="ctx-value" data-action="switch-branch" @click="toggle('branch')">{{ ctx.branchName }} <Icon name="chevron-down" /></button>
          <div v-if="openMenu === 'branch'" class="ctx-menu" role="menu" aria-label="Pilih cabang">
            <div class="popover-head"><div class="card-head-text"><span class="card-title">Cabang</span><span class="card-note">Membatasi register, dasbor, dan laporan keuangan</span></div></div>
            <div class="menu">
              <button v-if="session.allBranches" class="menu-item" role="menuitemradio" :aria-checked="ctx.branch === 'ALL'" data-set-branch="ALL" @click="setBranch('ALL')">
                <Icon name="layers" /><span style="flex:1;display:flex;flex-direction:column"><span>Semua cabang</span><span class="micro">Konsolidasi dengan eliminasi RK antar kantor</span></span><Icon v-if="ctx.branch === 'ALL'" name="check" />
              </button>
              <div v-if="session.allBranches" class="menu-sep"></div>
              <button v-for="b in session.branches.filter((x) => x.status === 'aktif')" :key="b.code" class="menu-item" role="menuitemradio" :aria-checked="ctx.branch === b.code" :data-set-branch="b.code" @click="setBranch(b.code)">
                <Icon name="map-pin" /><span style="flex:1;display:flex;flex-direction:column"><span>{{ b.name }}</span><span class="micro">{{ b.type }}</span></span><Icon v-if="ctx.branch === b.code" name="check" />
              </button>
            </div>
          </div>
        </div>
        <div class="ctx-field">
          <span class="micro">Periode</span>
          <button class="ctx-value" data-action="switch-period" @click="toggle('period')">{{ ctx.periodLabel }}<template v-if="ctx.periodInfo?.status === 'closed'"> · ditutup</template> <Icon name="chevron-down" /></button>
          <div v-if="openMenu === 'period'" class="ctx-menu" role="menu" aria-label="Pilih periode">
            <div class="menu">
              <div class="palette-group-label">Bulan</div>
              <button v-for="p in months" :key="p.id" class="menu-item" role="menuitemradio" :aria-checked="ctx.period === p.id" :data-set-period="p.id" @click="setPeriod(p.id)">
                <Icon name="calendar" /><span style="flex:1">{{ p.label }}</span><span v-if="p.status === 'closed'" class="micro">ditutup</span><Icon v-if="ctx.period === p.id" name="check" />
              </button>
              <div class="palette-group-label">Kuartal &amp; tahun</div>
              <button v-for="p in others" :key="p.id" class="menu-item" role="menuitemradio" :aria-checked="ctx.period === p.id" :data-set-period="p.id" @click="setPeriod(p.id)">
                <Icon name="calendar" /><span style="flex:1">{{ p.label }}</span><Icon v-if="ctx.period === p.id" name="check" />
              </button>
            </div>
          </div>
        </div>
        <div class="ctx-field">
          <span class="micro">Mata uang</span>
          <span class="ctx-static">IDR — Rupiah</span>
        </div>
        <div class="contextbar-spacer"></div>
      </div>

      <main class="content" id="content" @click="openMenu && close()">
        <div class="content-inner"><slot /></div>
      </main>
    </div>
    <RouterLink v-if="session.can('ledger.report.read') && route.path !== '/asisten'" to="/asisten" class="fab" aria-label="Buka Asisten AI">
      <Icon name="sparkles" /><span class="fab-label">Tanya Asisten AI</span>
    </RouterLink>
  </div>
</template>
