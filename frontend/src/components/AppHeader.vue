<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Seal from './Seal.vue'
import { useCatalog } from '@/stores/catalog'
import { useCart } from '@/stores/cart'
import { useSession } from '@/stores/session'

const catalog = useCatalog()
const cart = useCart()
const session = useSession()
const router = useRouter()

const storeModel = computed({
  get: () => catalog.storeId,
  // Cart items are kept per store, so switching just changes which ones are shown.
  set: (id: number) => { void catalog.setStore(id) },
})

async function logout() {
  await session.logout()
  void router.push('/')
}
</script>

<template>
  <header class="head">
    <div class="wrap head__in">
      <RouterLink to="/" class="brand" aria-label="得茶 Tehcha 首頁">
        <Seal :size="38" />
        <span class="brand__txt"><strong>得茶</strong><span class="en">Tehcha</span></span>
      </RouterLink>

      <nav class="nav" aria-label="主選單">
        <RouterLink to="/menu">菜單</RouterLink>
        <RouterLink to="/orders">訂單</RouterLink>
        <RouterLink to="/points">點數</RouterLink>
        <RouterLink to="/stores">門市</RouterLink>
        <RouterLink v-if="session.isStaff" to="/staff">後台</RouterLink>
      </nav>

      <div class="tools">
        <label class="store">
          <span class="en">門市</span>
          <select v-model.number="storeModel" aria-label="選擇門市">
            <option v-for="s in catalog.stores" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </label>
        <RouterLink to="/cart" class="cartlink" aria-label="購物車">
          購物車<span v-if="cart.count" class="count">{{ cart.count }}</span>
        </RouterLink>
        <template v-if="session.isLoggedIn">
          <RouterLink to="/account">{{ session.user?.name }}</RouterLink>
          <button class="linkbtn" @click="logout">登出</button>
        </template>
        <RouterLink v-else to="/login" class="btn btn--small">登入</RouterLink>
      </div>
    </div>
    <div class="wave" aria-hidden="true"></div>
  </header>
</template>

<style scoped>
.head { background: var(--paper); position: sticky; top: 0; z-index: 20; }
.head__in { display: flex; align-items: center; gap: 24px; min-height: 68px; flex-wrap: wrap; padding-block: 8px; }
.brand { display: flex; align-items: center; gap: 10px; color: var(--qinghua); }
.brand:hover { text-decoration: none; }
.brand__txt { display: grid; line-height: 1.1; }
.brand__txt strong { font-family: var(--serif); font-size: 20px; letter-spacing: 0.1em; }
.nav { display: flex; gap: 22px; margin-left: 12px; }
.nav a { padding: 6px 2px; border-bottom: 1px solid transparent; }
.nav a.router-link-active { border-bottom-color: var(--qinghua); }
.tools { display: flex; align-items: center; gap: 16px; margin-left: auto; flex-wrap: wrap; font-size: 15px; }
.store { display: flex; align-items: center; gap: 6px; }
.store select { background: transparent; border: 0; border-bottom: 1px solid var(--line); padding: 4px 2px; color: var(--qinghua); font-weight: 500; }
.cartlink { position: relative; padding-right: 4px; }
.count {
  display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px; margin-left: 6px;
  background: var(--seal); color: #fff; border-radius: 10px; font-size: 12px;
}
.linkbtn { background: none; border: 0; color: var(--tea); cursor: pointer; padding: 0; }
.linkbtn:hover { color: var(--qinghua); }
/* Phones: logo + store picker only; navigation lives in the bottom TabBar. */
@media (max-width: 720px) {
  .head__in { min-height: 56px; gap: 12px; flex-wrap: nowrap; padding-block: 6px; }
  .nav, .tools > :not(.store) { display: none; }
  .brand__txt strong { font-size: 18px; }
  .store .en { display: none; }
  .store select { font-size: 15px; max-width: 42vw; }
}
</style>
