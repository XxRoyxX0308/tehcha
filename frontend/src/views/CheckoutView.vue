<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import PriceBreakdown from '@/components/PriceBreakdown.vue'
import { useCart, useQuote } from '@/stores/cart'
import { useCatalog } from '@/stores/catalog'
import { useSession } from '@/stores/session'
import { ApiError, errorText, http } from '@/api'
import { DELIVERY_FEE } from '@/lib/pricing'
import { money } from '@/lib/format'
import type { Fulfillment } from '@/types'

// CUI-004 / OCS-F-001, OCS-F-002: store, pickup or delivery, points, and the full breakdown.
const cart = useCart()
const catalog = useCatalog()
const session = useSession()
const router = useRouter()

const fulfillment = ref<Fulfillment>('pickup')
const address = ref(session.user?.address ?? '')
const pointsInput = ref(0)
const busy = ref(false)
const error = ref('')

const { quote, error: quoteError, loading, refresh } = useQuote(fulfillment, pointsInput)
// keep the typed value inside what the rules allow (BR-004)
watch(() => quote.value?.maxPoints, (m) => { if (m !== undefined && pointsInput.value > m) pointsInput.value = m })

const addressMissing = computed(() => fulfillment.value === 'delivery' && !address.value.trim())
const blocked = computed(() => busy.value || loading.value || addressMissing.value || !quote.value || !!quote.value.problems.length)

async function place() {
  if (blocked.value || !quote.value) return
  error.value = ''
  busy.value = true
  try {
    // expectedTotal: the server refuses if the amount changed since this screen was priced
    const order = await http.post<{ id: number; pickupNo: number }>('/orders', {
      storeId: catalog.storeId, fulfillment: fulfillment.value, deliveryAddress: address.value.trim(),
      pointsRequested: quote.value.pointsUsed, expectedTotal: quote.value.total,
    })
    await Promise.all([cart.sync(), catalog.refreshStock(), session.refresh()])
    void router.replace(`/orders/${order.id}?new=1`)
  } catch (e) {
    error.value = errorText(e, '下單失敗，請稍後再試')
    if (e instanceof ApiError && (e.code === 'price_changed' || e.code === 'stock')) {
      await Promise.all([refresh(), catalog.refreshStock(), cart.sync()])
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page wrap stack" style="--gap: 28px">
    <header class="stack" style="--gap: 6px">
      <p class="en">Checkout</p>
      <h1>結帳</h1>
    </header>

    <div v-if="!cart.current.length" class="stack">
      <p class="muted">這間門市的購物車是空的。</p>
      <RouterLink to="/menu" class="btn" style="justify-self: start">回菜單</RouterLink>
    </div>

    <div v-else class="layout">
      <div class="stack" style="--gap: 28px">
        <section class="stack">
          <h2>取餐門市</h2>
          <div class="card pad">
            <strong>{{ catalog.store?.name }}</strong>
            <p class="small muted">{{ catalog.store?.address }} · {{ catalog.store?.phone }}</p>
            <p class="small muted">要換門市請從上方選單切換，購物車會依門市分開保存。</p>
          </div>
        </section>

        <section class="stack">
          <h2>取餐方式</h2>
          <div class="chips">
            <button class="chip" :aria-pressed="fulfillment === 'pickup'" @click="fulfillment = 'pickup'">到店自取（免運）</button>
            <button class="chip" :aria-pressed="fulfillment === 'delivery'" @click="fulfillment = 'delivery'">外送（NT${{ DELIVERY_FEE }}）</button>
          </div>
          <div v-if="fulfillment === 'delivery'" class="field">
            <label for="addr">配送地址</label>
            <input id="addr" v-model="address" class="input" autocomplete="street-address" maxlength="200" />
            <p v-if="addressMissing" class="error">外送須填寫配送地址</p>
          </div>
        </section>

        <section class="stack">
          <h2>茶點數 <span class="en">Points</span></h2>
          <p class="small muted">目前 {{ quote?.pointsBalance ?? session.points }} 點，本單最多折抵 {{ quote?.maxPoints ?? 0 }} 點（上限為應付金額 50%，1 點折 NT$1）。</p>
          <div class="row">
            <input v-model.number="pointsInput" class="input pts" type="number" min="0" :max="quote?.maxPoints ?? 0" inputmode="numeric" aria-label="使用點數" />
            <button class="btn btn--small" @click="pointsInput = quote?.maxPoints ?? 0">全部使用</button>
            <button class="btn btn--small" @click="pointsInput = 0">不使用</button>
          </div>
        </section>
      </div>

      <aside class="card sum stack" style="--gap: 16px">
        <h2>訂單明細</h2>
        <ul class="items">
          <li v-for="(i, n) in cart.current" :key="i.id" class="row between small">
            <span>{{ catalog.productById(i.productId)?.name }} × {{ i.quantity }}</span>
            <span v-if="quote?.lines[n]">{{ money(quote.lines[n].lineTotal) }}</span>
          </li>
        </ul>
        <hr class="rule" style="margin:0" />
        <PriceBreakdown v-if="quote" v-bind="quote" :discounts="quote.applied" :total="quote.total" />
        <p v-else-if="quoteError" class="error">{{ quoteError }}</p>
        <p v-for="p in quote?.problems ?? []" :key="p" class="error">{{ p }}</p>
        <p class="small muted">結案後可獲得 {{ quote?.pointsEarned ?? 0 }} 點。第三方付款不在本系統範圍，按下確認即視為付款完成。</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button class="btn btn--primary" :disabled="blocked" @click="place">{{ busy ? '送出中…' : '確認付款並下單' }}</button>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: 1fr 360px; gap: 32px; align-items: start; }
.pad { padding: 16px 18px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.pts { max-width: 140px; }
.sum { padding: 22px; position: sticky; top: 96px; }
.items { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; }
h2 .en { margin-left: 8px; }
.sum > .btn { width: 100%; }
@media (max-width: 860px) { .layout { grid-template-columns: 1fr; } .sum { position: static; } }
@media (max-width: 600px) {
  .layout > .stack { --gap: 22px !important; }
  .pts { max-width: none; flex: 1; min-width: 0; }
  .sum { padding: 18px; }
}
</style>
