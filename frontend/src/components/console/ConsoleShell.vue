<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Seal from '@/components/Seal.vue'
import { useSession } from '@/stores/session'
import { useStaff } from '@/stores/staff'

// Staff and admin console (SUI / AUI): sidebar on desktop, a drawer on phones.
const session = useSession()
const staff = useStaff()
const route = useRoute()
const router = useRouter()
const open = ref(false)
const loadError = ref('')

const shopNav = [
  { to: '/staff', label: '訂單看板', en: 'Board' },
  { to: '/staff/products', label: '商品管理', en: 'Products' },
  { to: '/staff/options', label: '客製化選項', en: 'Options' },
  { to: '/staff/stock', label: '門市與庫存', en: 'Stock', alerts: true },
  { to: '/staff/discounts', label: '折扣政策', en: 'Discounts' },
  { to: '/staff/reports', label: '銷售報表', en: 'Reports' },
  { to: '/staff/reviews', label: '門市評論', en: 'Reviews' },
]
const adminNav = [
  { to: '/admin', label: '帳號與權限', en: 'Accounts' },
  { to: '/admin/database', label: '資料庫維護', en: 'Database' },
]
const isStaffPage = computed(() => route.path.startsWith('/staff'))

onMounted(async () => {
  if (!session.isStaff) return
  try { await staff.load() } catch (e) { loadError.value = (e as Error).message }
})
watch(() => route.fullPath, () => { open.value = false })

async function logout() {
  await session.logout()
  void router.push('/login')
}
</script>

<template>
  <div class="cs" :class="{ open }">
    <a class="skip" href="#console-main">跳到主要內容</a>
    <header class="cs__top">
      <button class="cs__menu" :aria-expanded="open" aria-controls="console-nav" @click="open = !open">
        <span aria-hidden="true">{{ open ? '✕' : '☰' }}</span><span class="visually-hidden">選單</span>
      </button>
      <RouterLink to="/staff" class="cs__brand"><Seal :size="30" /><strong>得茶後台</strong></RouterLink>
    </header>

    <nav id="console-nav" class="cs__nav" aria-label="後台選單">
      <RouterLink to="/staff" class="cs__brand cs__brand--side"><Seal :size="34" /><span><strong>得茶後台</strong><span class="en">Tehcha console</span></span></RouterLink>

      <label v-if="session.isStaff && staff.stores.length" class="cs__store">
        <span class="en">門市</span>
        <select class="input input--sm" :value="staff.storeId" aria-label="切換門市" @change="staff.setStore(Number(($event.target as HTMLSelectElement).value))">
          <option v-for="s in staff.stores" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </label>

      <p class="cs__group en">店務 · Shop</p>
      <RouterLink v-for="n in shopNav" :key="n.to" :to="n.to" class="cs__link" :class="{ on: route.path === n.to }">
        <span>{{ n.label }}</span>
        <b v-if="n.alerts && staff.alerts.length" class="cs__badge" :title="`${staff.alerts.length} 項低於安全庫存`">{{ staff.alerts.length }}</b>
      </RouterLink>

      <template v-if="session.isAdmin">
        <p class="cs__group en">管理 · Admin</p>
        <RouterLink v-for="n in adminNav" :key="n.to" :to="n.to" class="cs__link" :class="{ on: route.path === n.to }">{{ n.label }}</RouterLink>
      </template>

      <div class="cs__me">
        <p><strong>{{ session.user?.name }}</strong> <span class="small muted">{{ session.user?.loginId }}</span></p>
        <div class="row" style="--gap: 14px">
          <RouterLink to="/" class="small">顧客網站</RouterLink>
          <button class="linkbtn small" @click="logout">登出</button>
        </div>
      </div>
    </nav>

    <main id="console-main" class="cs__main">
      <p v-if="loadError" class="notice notice--red">{{ loadError }}</p>
      <p v-else-if="isStaffPage && session.isStaff && !staff.stores.length" class="notice">你的帳號尚未被指派到任何門市，請聯絡管理員。</p>
      <slot />
    </main>
  </div>
</template>

<style scoped>
.cs { min-height: 100dvh; display: grid; grid-template-columns: 232px minmax(0, 1fr); background: var(--paper); }
.cs__top { display: none; }
.cs__nav {
  position: sticky; top: 0; height: 100dvh; overflow-y: auto; display: flex; flex-direction: column; gap: 2px;
  padding: 20px 14px; border-right: 1px solid var(--line); background: var(--paper-deep);
}
.cs__brand { display: flex; align-items: center; gap: 10px; color: var(--qinghua); }
.cs__brand:hover { text-decoration: none; }
.cs__brand span { display: grid; line-height: 1.2; }
.cs__brand strong { font-family: var(--serif); font-size: 18px; letter-spacing: 0.08em; }
.cs__brand--side { padding: 0 6px 16px; }
.cs__store { display: grid; gap: 4px; padding: 0 6px 14px; border-bottom: 1px solid var(--line); margin-bottom: 8px; }
.cs__group { padding: 14px 8px 4px; font-size: 11px; }
.cs__link {
  display: flex; align-items: center; justify-content: space-between; min-height: 40px; padding: 0 10px;
  border-radius: 4px; color: var(--ink); font-size: 15px;
}
.cs__link:hover { background: var(--paper); text-decoration: none; }
.cs__link.on { background: var(--qinghua); color: var(--paper); }
.cs__badge { min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: var(--seal); color: #fff; font-size: 12px; display: grid; place-items: center; }
.cs__me { margin-top: auto; padding: 16px 8px 0; border-top: 1px solid var(--line); display: grid; gap: 6px; }
.cs__main { padding: clamp(20px, 3vw, 36px) clamp(16px, 3vw, 40px) 64px; min-width: 0; }

@media (max-width: 900px) {
  .cs { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .cs__top {
    display: flex; align-items: center; gap: 12px; position: sticky; top: 0; z-index: 30;
    padding: 8px 16px; background: var(--paper-deep); border-bottom: 1px solid var(--line);
  }
  .cs__menu { width: 44px; height: 44px; border: 1px solid var(--line); border-radius: 4px; background: var(--paper); font-size: 18px; cursor: pointer; color: var(--qinghua); }
  .cs__brand--side { display: none; }
  .cs__nav { display: none; position: fixed; inset: 61px 0 0; z-index: 40; height: auto; border-right: 0; }
  .cs.open .cs__nav { display: flex; }
  .cs__link { min-height: 48px; }
}
</style>
