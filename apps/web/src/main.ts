import { createApp } from 'vue';
import { createPinia } from 'pinia';
import '@erp/ui/tokens.css';
import '@erp/ui/app.css';
import './styles.css';
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
