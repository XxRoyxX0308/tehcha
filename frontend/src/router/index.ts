import { createRouter, createWebHistory } from 'vue-router'
import { useSession } from '@/stores/session'

declare module 'vue-router' {
  interface RouteMeta {
    auth?: boolean // any signed-in account
    customer?: boolean // customers only (cart checkout, orders, points)
    role?: 'staff' | 'admin' // UMS-F-005: the console areas
    console?: boolean // staff / admin layout
    title?: string
  }
}

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    // ── customer (CUI-001..007) ──
    { path: '/', component: () => import('@/views/HomeView.vue') },
    { path: '/menu', component: () => import('@/views/MenuView.vue'), meta: { title: '菜單' } },
    { path: '/cart', component: () => import('@/views/CartView.vue'), meta: { title: '購物車' } },
    { path: '/stores', component: () => import('@/views/StoresView.vue'), meta: { title: '門市與評價' } },
    { path: '/checkout', component: () => import('@/views/CheckoutView.vue'), meta: { customer: true, title: '結帳' } },
    { path: '/orders', component: () => import('@/views/OrdersView.vue'), meta: { customer: true, title: '我的訂單' } },
    { path: '/orders/:id', component: () => import('@/views/OrderDetailView.vue'), meta: { customer: true, title: '訂單狀態' } },
    { path: '/points', component: () => import('@/views/PointsView.vue'), meta: { customer: true, title: '茶點數' } },
    { path: '/account', component: () => import('@/views/AccountView.vue'), meta: { auth: true, title: '會員資料' } },
    { path: '/login', component: () => import('@/views/AuthView.vue'), props: { mode: 'login' }, meta: { title: '登入' } },
    { path: '/register', component: () => import('@/views/AuthView.vue'), props: { mode: 'register' }, meta: { title: '加入會員' } },

    // ── staff (SUI-001..005) ──
    { path: '/staff', component: () => import('@/views/staff/BoardView.vue'), meta: { role: 'staff', console: true, title: '訂單看板' } },
    { path: '/staff/products', component: () => import('@/views/staff/ProductsView.vue'), meta: { role: 'staff', console: true, title: '商品管理' } },
    { path: '/staff/options', component: () => import('@/views/staff/OptionsView.vue'), meta: { role: 'staff', console: true, title: '客製化選項' } },
    { path: '/staff/stock', component: () => import('@/views/staff/StockView.vue'), meta: { role: 'staff', console: true, title: '門市與庫存' } },
    { path: '/staff/discounts', component: () => import('@/views/staff/DiscountsView.vue'), meta: { role: 'staff', console: true, title: '折扣政策' } },
    { path: '/staff/reports', component: () => import('@/views/staff/ReportsView.vue'), meta: { role: 'staff', console: true, title: '銷售報表' } },
    { path: '/staff/reviews', component: () => import('@/views/staff/ReviewsView.vue'), meta: { role: 'staff', console: true, title: '門市評論' } },

    // ── admin (AUI-001, AUI-002) ──
    { path: '/admin', component: () => import('@/views/admin/UsersView.vue'), meta: { role: 'admin', console: true, title: '帳號與權限' } },
    { path: '/admin/database', component: () => import('@/views/admin/DatabaseView.vue'), meta: { role: 'admin', console: true, title: '資料庫維護' } },

    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: (to, from, saved) => saved ?? (to.path === from.path ? undefined : { top: 0 }),
})

// UMS-N-002 on the client side too: the API checks again on every call.
router.beforeEach((to) => {
  const s = useSession()
  const needsLogin = to.meta.auth || to.meta.customer || to.meta.role
  if (needsLogin && !s.isLoggedIn) return { path: '/login', query: { next: to.fullPath } }
  if (to.meta.customer && !s.isCustomer) return s.home
  if (to.meta.role === 'staff' && !s.isStaff) return '/'
  if (to.meta.role === 'admin' && !s.isAdmin) return s.isStaff ? '/staff' : '/'
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title}｜得茶 Tehcha` : '得茶 Tehcha｜線上點茶，到店即取'
})
