import { createRouter, createWebHistory } from 'vue-router'
import { useSession } from '@/stores/session'

// Customer area is the site root. /staff and /admin will be added as sibling route trees
// with their own role guards (SRS UMS-N-002 RBAC).
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('@/views/HomeView.vue') },
    { path: '/menu', component: () => import('@/views/MenuView.vue') },
    { path: '/cart', component: () => import('@/views/CartView.vue') },
    { path: '/checkout', component: () => import('@/views/CheckoutView.vue'), meta: { auth: true } },
    { path: '/orders', component: () => import('@/views/OrdersView.vue'), meta: { auth: true } },
    { path: '/orders/:id', component: () => import('@/views/OrderDetailView.vue'), meta: { auth: true } },
    { path: '/points', component: () => import('@/views/PointsView.vue'), meta: { auth: true } },
    { path: '/account', component: () => import('@/views/AccountView.vue'), meta: { auth: true } },
    { path: '/login', component: () => import('@/views/AuthView.vue'), props: { mode: 'login' } },
    { path: '/register', component: () => import('@/views/AuthView.vue'), props: { mode: 'register' } },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
})

router.beforeEach((to) => {
  if (to.meta.auth && !useSession().isLoggedIn) return { path: '/login', query: { next: to.fullPath } }
})
