import { createRouter, createWebHistory } from 'vue-router';

const routes = [
  { path: '/', redirect: '/search' },
  { path: '/search', name: 'search', component: () => import('./views/SearchPage.vue'), meta: { title: '搜索', icon: 'mdi-magnify' } },
  { path: '/stats', name: 'stats', component: () => import('./views/StatsDashboard.vue'), meta: { title: '总览看板', icon: 'mdi-view-dashboard' } },
  { path: '/sources', name: 'sources', component: () => import('./views/SourcesManage.vue'), meta: { title: '搜索源管理', icon: 'mdi-cog' } },
  { path: '/proxies', name: 'proxies', component: () => import('./views/ProxiesManage.vue'), meta: { title: '代理管理', icon: 'mdi-server-network' } },
  { path: '/keys', name: 'keys', component: () => import('./views/KeysManage.vue'), meta: { title: '访问密钥', icon: 'mdi-key' } },
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
});