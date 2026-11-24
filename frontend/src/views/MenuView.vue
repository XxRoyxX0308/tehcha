<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ProductCard from '@/components/ProductCard.vue'
import CustomizeModal from '@/components/CustomizeModal.vue'
import { useCatalog } from '@/stores/catalog'
import { useSession } from '@/stores/session'
import { useCart } from '@/stores/cart'
import { http } from '@/api'
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
const PRICE: Record<string, { minPrice?: number; maxPrice?: number }> = {
  all: {}, lt50: { maxPrice: 49 }, '50-65': { minPrice: 50, maxPrice: 65 }, gt65: { minPrice: 66 },
}

// SRMS-F-004: "your usual" from the signed-in customer's own orders.
const usualIds = ref<number[]>([])
onMounted(async () => {
  void catalog.refreshStock()
  if (!session.isCustomer) return
  try { usualIds.value = (await http.get<{ productId: number }[]>('/me/usual')).map((r) => r.productId) } catch { /* optional */ }
})

const filtering = computed(() => !!q.value.trim() || cat.value !== 0 || price.value !== 'all')

// SRMS-F-001/002: keyword, category and price range are searched in the database.
const resultIds = ref<number[] | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
let seq = 0
watch([q, cat, price], () => {
  clearTimeout(timer)
  timer = setTimeout(async () => {
    const mine = ++seq
    try {
      const r = await http.get<{ ids: number[] }>('/products/search', { q: q.value.trim(), categoryId: cat.value || undefined, ...PRICE[price.value] })
      if (mine === seq) resultIds.value = r.ids
    } catch { if (mine === seq) resultIds.value = null }
  }, 220)
})
const results = computed(() =>
  filtering.value && resultIds.value
    ? resultIds.value.map((id) => catalog.productById(id)).filter((p): p is Product => !!p)
    : catalog.products,
)

// SRMS-F-003: best sellers of the last 30 days.
const popular = computed(() => catalog.popular.slice(0, 3).map((r) => catalog.productById(r.productId)).filter((p): p is Product => !!p))
const usual = computed(() => usualIds.value.slice(0, 3).map((id) => catalog.productById(id)).filter((p): p is Product => !!p))

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
        <h2>熱門飲品 <span class="en">Popular</span></h2>
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

    <CustomizeModal v-if="picked" :key="picked.id" :product="picked" @close="picked = null" @added="added" @pick="picked = $event" />
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
