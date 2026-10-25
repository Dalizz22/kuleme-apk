import { createRouter, createWebHashHistory } from 'vue-router';
import { session } from './store';
import { setUnauthorizedHandler } from './api';

const router = createRouter({
  // hash 路由：file:// 与 base './' 下无需服务端 rewrite。
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/home' },
    { path: '/settings', component: () => import('./pages/Settings.vue'), meta: { title: '服务器设置' } },
    { path: '/login', component: () => import('./pages/Login.vue'), meta: { title: '登录' } },
    { path: '/home', component: () => import('./pages/Home.vue'), meta: { title: '库了么' } },
    { path: '/capture', component: () => import('./pages/Capture.vue'), meta: { title: '拍照入库' } },
    { path: '/review/:taskId', component: () => import('./pages/Review.vue'), meta: { title: '候选确认' } },
    { path: '/manual', component: () => import('./pages/Manual.vue'), meta: { title: '手动建档' } },
    { path: '/success', component: () => import('./pages/Success.vue'), meta: { title: '入库成功' } },
    { path: '/items', component: () => import('./pages/Items.vue'), meta: { title: '物品' } },
    { path: '/items/:id', component: () => import('./pages/ItemDetail.vue'), meta: { title: '物品详情' } },
    { path: '/scan', component: () => import('./pages/Scan.vue'), meta: { title: '扫码' } },
  ],
});

router.beforeEach((to) => {
  document.title = (to.meta.title as string) || '库了么';
  if (!session.baseUrl && to.path !== '/settings') return '/settings';
  if (!session.token && to.path !== '/login' && to.path !== '/settings') return '/login';
});

setUnauthorizedHandler(() => router.push('/login'));

export default router;
