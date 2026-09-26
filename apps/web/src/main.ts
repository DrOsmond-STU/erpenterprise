import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@erp/ui/tokens.css';
import '@erp/ui/app.css';
import './styles.css';
/* Huruf dihosting sendiri (CSP font-src 'self'); hanya subset Latin. */
import '@fontsource/plus-jakarta-sans/latin-600.css';
import '@fontsource/plus-jakarta-sans/latin-700.css';
import '@fontsource/plus-jakarta-sans/latin-800.css';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-sans/latin-700.css';
import '@fontsource/ibm-plex-mono/latin-500.css';
import '@fontsource/ibm-plex-mono/latin-600.css';
import './theme-kg.css';
import App from './App.vue';
import { router } from './router';
import { configureApi } from './lib/api';
import { useSession } from './stores/session';
import { useContext } from './stores/context';

const app = createApp(App);
const pinia = createPinia();
app.use(pinia);

const session = useSession(pinia);
const context = useContext(pinia);
configureApi({
  ctx: () => ({ token: session.token, branch: context.branch, period: context.period }),
  onUnauthenticated: () => { session.clear(); if (router.currentRoute.value.path !== '/masuk') router.push({ path: '/masuk', query: { next: router.currentRoute.value.fullPath } }); },
  onRefreshed: (token) => session.setToken(token),
});

app.use(router);
app.mount('#app');
