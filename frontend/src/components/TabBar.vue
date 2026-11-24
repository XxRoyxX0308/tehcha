<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { useCart } from '@/stores/cart'
import { useSession } from '@/stores/session'

// Phone-only bottom navigation (hidden above 720px), like an ordering app.
const cart = useCart()
const session = useSession()
</script>

<template>
  <nav class="tabs" aria-label="主選單">
    <RouterLink to="/menu" class="tab">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 8h11M7.5 8l1 12.2a1 1 0 0 0 1 .8h5a1 1 0 0 0 1-.8l1-12.2M7.5 8c.6-2.6 2.4-4 4.5-4s3.9 1.4 4.5 4M13 4.2l1-3" /><path d="M9 13.5q1.5-1 3 0t3 0" /></svg>
      <span>菜單</span>
    </RouterLink>
    <RouterLink to="/cart" class="tab">
      <span class="ico">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 12.1a1 1 0 0 1-1 .9H7.2a1 1 0 0 1-1-.9zM9 8V6.5a3 3 0 0 1 6 0V8" /></svg>
        <b v-if="cart.count" class="badge">{{ cart.count }}</b>
      </span>
      <span>購物車</span>
    </RouterLink>
    <RouterLink to="/orders" class="tab">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3" /></svg>
      <span>訂單</span>
    </RouterLink>
    <RouterLink :to="session.isStaff ? '/staff' : '/points'" class="tab">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5c1.6 1.5 1.6 3.5 0 4.5-1.6-1-1.6-3 0-4.5zM12 12c1.8-.4 3.4.5 3.6 2.4-1.8.4-3.2-.6-3.6-2.4zM12 12c-.4 1.8-2 2.8-3.6 2.4.2-1.9 1.8-2.8 3.6-2.4z" /></svg>
      <span>{{ session.isStaff ? '後台' : '點數' }}</span>
    </RouterLink>
    <RouterLink :to="session.isLoggedIn ? '/account' : '/login'" class="tab">
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c1-3.8 4-5.7 7.5-5.7s6.5 1.9 7.5 5.7" /></svg>
      <span>{{ session.isLoggedIn ? '我的' : '登入' }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.tabs {
  display: none;
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 40;
  background: var(--paper); border-top: 1px solid var(--line);
  padding: 6px 4px calc(6px + env(safe-area-inset-bottom));
  grid-template-columns: repeat(5, 1fr);
}
.tab {
  display: grid; justify-items: center; gap: 2px; padding: 4px 0;
  color: var(--tea); font-size: 11px; text-decoration: none;
}
.tab svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.tab.router-link-active { color: var(--qinghua); font-weight: 700; }
.tab.router-link-active svg { stroke-width: 1.9; }
.ico { position: relative; }
.badge {
  position: absolute; top: -4px; right: -10px; min-width: 18px; height: 18px; padding: 0 5px;
  display: grid; place-items: center; border-radius: 9px;
  background: var(--seal); color: #fff; font-size: 11px; font-weight: 700;
}
@media (max-width: 720px) { .tabs { display: grid; } }
</style>
