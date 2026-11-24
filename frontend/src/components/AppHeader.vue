<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Seal from './Seal.vue'
import { useCatalog } from '@/stores/catalog'
import { useCart } from '@/stores/cart'
import { useSession } from '@/stores/session'
import { useHideOnScroll } from '@/lib/useHideOnScroll'

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

// Slides away while scrolling down, back on scroll up. --head-h tells sticky panels
// (cart / checkout summary) how much room the header currently takes.
const { hidden, show } = useHideOnScroll()
const el = ref<HTMLElement | null>(null)
const height = ref(0)
let ro: ResizeObserver | undefined
onMounted(() => {
  ro = new ResizeObserver(([e]) => { height.value = e.target.getBoundingClientRect().height })
  if (el.value) ro.observe(el.value)
})
watchEffect(() => document.documentElement.style.setProperty('--head-h', `${hidden.value ? 0 : height.value}px`))
onBeforeUnmount(() => {
  ro?.disconnect()
  document.documentElement.style.removeProperty('--head-h')
})
</script>

<template>
  <header ref="el" class="head" :class="{ 'is-hidden': hidden }" @focusin="show">
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
        <RouterLink to="/cart" class="tl cartlink" :aria-label="cart.count ? `購物車，${cart.count} 杯` : '購物車'">
          購物車<span v-if="cart.count" :key="cart.count" class="count" aria-hidden="true">{{ cart.count }}</span>
        </RouterLink>
        <template v-if="session.isLoggedIn">
          <RouterLink to="/account" class="tl">{{ session.user?.name }}</RouterLink>
          <button class="linkbtn" @click="logout">登出</button>
        </template>
        <RouterLink v-else to="/login" class="btn btn--small">登入</RouterLink>
      </div>
    </div>
    <div class="wave" aria-hidden="true"></div>
  </header>
</template>

<style scoped>
.head {
  background: var(--paper); position: sticky; top: 0; z-index: 20;
  transition: transform 0.32s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.head.is-hidden { transform: translateY(-100%); }
.head__in { display: flex; align-items: center; gap: 24px; min-height: 68px; flex-wrap: wrap; padding-block: 8px; }
.brand { display: flex; align-items: center; gap: 10px; color: var(--qinghua); }
.brand:hover { text-decoration: none; }
.brand__txt { display: grid; line-height: 1.1; }
.brand__txt strong { font-family: var(--serif); font-size: 20px; letter-spacing: 0.1em; }
.nav { display: flex; gap: 22px; margin-left: 12px; }
/* one underline that grows in on hover and stays on the current page */
.nav a, .tl { position: relative; padding: 6px 2px; }
.nav a::after, .tl::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 1px; background: currentColor;
  transform: scaleX(0); transition: transform 0.2s ease;
}
.nav a:hover, .tl:hover { text-decoration: none; }
.nav a:hover::after, .tl:hover::after { transform: scaleX(0.6); }
.nav a.router-link-active::after, .tl.router-link-active::after { transform: none; }
.tools { display: flex; align-items: center; gap: 16px; margin-left: auto; flex-wrap: wrap; font-size: 15px; }
.store { display: flex; align-items: center; gap: 6px; }
.store select { background: transparent; border: 0; border-bottom: 1px solid var(--line); padding: 4px 2px; color: var(--qinghua); font-weight: 500; cursor: pointer; }
.store select:hover { border-bottom-color: var(--qinghua); }
.cartlink { padding-right: 4px; }
.count {
  display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 5px; margin-left: 6px;
  background: var(--seal); color: #fff; border-radius: 10px; font-size: 12px;
  animation: bump 0.36s ease-out;
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
