<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import ProductCard from '@/components/ProductCard.vue'
import CustomizeModal from '@/components/CustomizeModal.vue'
import { useCatalog } from '@/stores/catalog'
import { useSession } from '@/stores/session'
import { useCart } from '@/stores/cart'
import { api } from '@/api'
import { useMedia } from '@/lib/useMedia'
import type { Product } from '@/types'

const phone = useMedia('(max-width: 600px)')

const catalog = useCatalog()
const session = useSession()
const cart = useCart()
const router = useRouter()

const q = ref('')
const cat = ref<number | 0>(0)
const price = ref<'all' | 'lt50' | '50-65' | 'gt65'>('all')
const picked = ref<Product | null>(null)
const toast = ref('')

// SRMS-F-004: "your usual" comes from the logged-in customer's order history.
const usualIds = ref<number[]>([])
onMounted(async () => {
  if (!session.user) return
  const orders = await api.listOrders(session.user.userId)
  const tally = new Map<number, number>()
  for (const o of orders) for (const it of o.items) tally.set(it.productId, (tally.get(it.productId) ?? 0) + it.quantity)
  usualIds.value = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => id)
})

const filtering = computed(() => !!q.value.trim() || cat.value !== 0 || price.value !== 'all')

const results = computed(() => {
  const k = q.value.trim().toLowerCase()
  return catalog.products.filter((p) => {
    if (cat.value && p.categoryId !== cat.value) return false
    if (price.value === 'lt50' && p.price >= 50) return false
    if (price.value === '50-65' && (p.price < 50 || p.price > 65)) return false
    if (price.value === 'gt65' && p.price <= 65) return false
    if (k && !(p.name + p.nameEn + p.description).toLowerCase().includes(k)) return false
    return true
  })
})

// SRMS-F-003: popular = highest sales.
const popular = computed(() =>
  [...catalog.products].sort((a, b) => (catalog.salesCount[b.id] ?? 0) - (catalog.salesCount[a.id] ?? 0)).slice(0, 3),
)
const usual = computed(() => usualIds.value.map((id) => catalog.productById(id)).filter((p): p is Product => !!p))

function added() {
  toast.value = '已加入購物車'
  setTimeout(() => (toast.value = ''), 1800)
}
</script>

<template>
  <div class="page wrap stack" :style="{ '--gap': phone ? '28px' : '36px' }">
    <header class="stack" style="--gap: 6px">
      <p class="en">Menu · {{ catalog.store?.name }}</p>
      <h1>菜單</h1>
    </header>

    <div class="stack" style="--gap: 14px">
      <input v-model="q" class="input" type="search" placeholder="想喝什麼？輸入名稱或關鍵字" aria-label="搜尋飲品" />
      <div class="chips scroll">
        <button class="chip" :aria-pressed="cat === 0" @click="cat = 0">全部</button>
        <button v-for="c in catalog.categories" :key="c.id" class="chip" :aria-pressed="cat === c.id" @click="cat = c.id">{{ c.name }}</button>
      </div>
      <div class="chips scroll" aria-label="價格區間">
        <button class="chip" :aria-pressed="price === 'all'" @click="price = 'all'">不限價格</button>
        <button class="chip" :aria-pressed="price === 'lt50'" @click="price = 'lt50'">NT$50 以下</button>
        <button class="chip" :aria-pressed="price === '50-65'" @click="price = '50-65'">50 – 65</button>
        <button class="chip" :aria-pressed="price === 'gt65'" @click="price = 'gt65'">65 以上</button>
      </div>
    </div>

    <template v-if="!filtering">
      <section v-if="usual.length" class="stack" style="--gap: 16px">
        <h2>你常點的 <span class="en">Your usual</span></h2>
        <div :class="phone ? 'rail' : 'grid'">
          <ProductCard v-for="p in usual" :key="p.id" :product="p" :variant="phone ? 'tile' : 'card'" @pick="picked = $event" />
        </div>
      </section>
      <section class="stack" style="--gap: 16px">
        <h2>本店熱門 <span class="en">Popular</span></h2>
        <div :class="phone ? 'rail' : 'grid'">
          <ProductCard v-for="p in popular" :key="p.id" :product="p" :variant="phone ? 'tile' : 'card'" @pick="picked = $event" />
        </div>
      </section>
    </template>

    <section class="stack" style="--gap: 16px">
      <h2>{{ filtering ? '搜尋結果' : '全部飲品' }} <span class="en">{{ results.length }} items</span></h2>
      <div v-if="results.length" class="grid"><ProductCard v-for="p in results" :key="p.id" :product="p" @pick="picked = $event" /></div>
      <p v-else class="muted">找不到符合的飲品，換個關鍵字試試。</p>
    </section>

    <div v-if="cart.count" class="dock">
      <button class="btn btn--primary" @click="router.push('/cart')">查看購物車（{{ cart.count }} 杯）</button>
    </div>

    <CustomizeModal v-if="picked" :product="picked" @close="picked = null" @added="added" />
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped>
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 20px; }
h2 .en { margin-left: 8px; }
.dock { position: sticky; bottom: 16px; display: flex; justify-content: center; }
.dock .btn { box-shadow: 0 0 0 6px var(--paper); }

/* horizontal swipe rail (phones) */
.rail {
  display: grid; grid-auto-flow: column; grid-auto-columns: 148px; gap: 12px;
  overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none;
  margin-inline: calc(-1 * var(--gutter)); padding: 2px var(--gutter) 6px;
  scroll-padding-inline: var(--gutter);
}
.rail::-webkit-scrollbar { display: none; }
.rail > * { scroll-snap-align: start; }

@media (max-width: 600px) {
  .chips.scroll {
    flex-wrap: nowrap; overflow-x: auto; scrollbar-width: none;
    margin-inline: calc(-1 * var(--gutter)); padding-inline: var(--gutter);
  }
  .chips.scroll::-webkit-scrollbar { display: none; }
  .chips.scroll .chip { flex: none; }
  .grid { grid-template-columns: 1fr; gap: 12px; }
}
/* the tab bar already shows the cart count on phones */
@media (max-width: 720px) { .dock { display: none; } }
</style>
