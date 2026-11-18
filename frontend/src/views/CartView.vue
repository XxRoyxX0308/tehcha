<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import Art from '@/components/Art.vue'
import PriceBreakdown from '@/components/PriceBreakdown.vue'
import { useCart } from '@/stores/cart'
import { useCatalog } from '@/stores/catalog'
import { useSession } from '@/stores/session'
import { validateQuantity } from '@/lib/pricing'
import { money } from '@/lib/format'

const cart = useCart()
const catalog = useCatalog()
const session = useSession()
const router = useRouter()

const rows = computed(() =>
  cart.current.flatMap((i) => {
    const p = catalog.productById(i.productId)
    if (!p) return []
    const names = i.optionIds.map((id) => catalog.optionById(id)?.name).filter(Boolean).join('・')
    const unit = p.price + cart.extraOf(i.optionIds)
    // BR-007: quantity may not exceed this store's stock.
    const err = validateQuantity(i.quantity, catalog.stockOf(p.id))
    return [{ i, p, names, unit, err }]
  }),
)

const totals = computed(() => cart.totals('pickup'))
const hasError = computed(() => rows.value.some((r) => r.err))

function setQty(id: number, q: number) { if (q >= 1) cart.setQuantity(id, q) }
function checkout() {
  void router.push(session.isLoggedIn ? '/checkout' : { path: '/login', query: { next: '/checkout' } })
}
</script>

<template>
  <div class="page wrap stack" style="--gap: 28px">
    <header class="stack" style="--gap: 6px">
      <p class="en">Cart · {{ catalog.store?.name }}</p>
      <h1>購物車</h1>
    </header>

    <div v-if="!rows.length" class="empty center">
      <Art kind="bowl" class="empty__art" />
      <p class="muted">杯子還是空的。</p>
      <RouterLink to="/menu" class="btn btn--primary">去挑一杯</RouterLink>
    </div>

    <div v-else class="layout">
      <ul class="lines">
        <li v-for="r in rows" :key="r.i.id" class="line">
          <div class="grow">
            <h3>{{ r.p.name }}</h3>
            <p class="small muted">{{ r.names || '無客製' }}</p>
            <p v-if="r.err" class="error">{{ r.err }}</p>
          </div>
          <div class="step">
            <button class="chip" :disabled="r.i.quantity <= 1" aria-label="減少" @click="setQty(r.i.id, r.i.quantity - 1)">−</button>
            <output>{{ r.i.quantity }}</output>
            <button class="chip" :disabled="r.i.quantity >= catalog.stockOf(r.p.id)" aria-label="增加" @click="setQty(r.i.id, r.i.quantity + 1)">＋</button>
          </div>
          <p class="price amt">{{ money(r.unit * r.i.quantity) }}</p>
          <button class="rm" aria-label="移除" @click="cart.remove(r.i.id)">✕</button>
        </li>
      </ul>

      <aside class="card sum stack" style="--gap: 16px">
        <h2>結帳明細</h2>
        <PriceBreakdown v-bind="totals" :discounts="totals.applied" :total="totals.total" />
        <p class="small muted">外送將加收 NT$60 運費；點數於下一步使用。</p>
        <button class="btn btn--primary" :disabled="hasError" @click="checkout">前往結帳</button>
        <RouterLink to="/menu" class="small center">繼續選購</RouterLink>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: 1fr 340px; gap: 32px; align-items: start; }
.lines { list-style: none; margin: 0; padding: 0; }
.line { display: flex; align-items: center; gap: 16px; padding: 16px 0; border-bottom: 1px solid var(--line); }
.line:first-child { border-top: 1px solid var(--line); }
.step { display: flex; align-items: center; gap: 10px; }
.step output { min-width: 24px; text-align: center; font-family: var(--serif); font-size: 18px; }
.step .chip { padding: 0; width: 34px; min-height: 34px; justify-content: center; }
.step .chip:disabled { opacity: 0.4; cursor: not-allowed; }
.amt { min-width: 84px; text-align: right; }
.rm { background: none; border: 0; color: var(--tea); cursor: pointer; padding: 6px; }
.rm:hover { color: var(--seal); }
.sum { padding: 22px; position: sticky; top: 96px; }
.empty { display: grid; justify-items: center; gap: 16px; padding-block: 32px; }
.empty__art { width: 160px; color: var(--qinghua); }
.sum > .btn { width: 100%; }
.sum > a.small { display: block; text-align: center; }
@media (max-width: 820px) {
  .layout { grid-template-columns: 1fr; gap: 24px; }
  .sum { position: static; }
}
/* Phones: name + options on top, stepper and price underneath */
@media (max-width: 600px) {
  .line {
    display: grid; grid-template-columns: 1fr auto; row-gap: 10px; column-gap: 12px;
    grid-template-areas: 'info rm' 'step amt';
  }
  .line > .grow { grid-area: info; }
  .line > .step { grid-area: step; }
  .line > .amt { grid-area: amt; align-self: center; }
  .line > .rm { grid-area: rm; align-self: start; margin: -4px -6px 0 0; }
  .sum { padding: 18px; }
}
</style>
