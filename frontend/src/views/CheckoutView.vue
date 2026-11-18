<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import PriceBreakdown from '@/components/PriceBreakdown.vue'
import { useCart } from '@/stores/cart'
import { useCatalog } from '@/stores/catalog'
import { useSession } from '@/stores/session'
import { api, ApiError } from '@/api'
import type { Fulfillment } from '@/types'

const cart = useCart()
const catalog = useCatalog()
const session = useSession()
const router = useRouter()

const fulfillment = ref<Fulfillment>('pickup')
const address = ref(session.user?.address ?? '')
const pointsInput = ref(0)
const busy = ref(false)
const error = ref('')

const totals = computed(() => cart.totals(fulfillment.value, pointsInput.value))
// Keep the typed value inside what the rules allow (BR-004).
watch(() => totals.value.maxPoints, (m) => { if (pointsInput.value > m) pointsInput.value = m })

const addressMissing = computed(() => fulfillment.value === 'delivery' && !address.value.trim())

async function place() {
  if (!session.user || busy.value) return
  error.value = ''
  busy.value = true
  try {
    const order = await api.placeOrder({
      userId: session.user.userId, storeId: catalog.storeId, fulfillment: fulfillment.value,
      deliveryAddress: address.value, items: cart.current, pointsRequested: totals.value.pointsUsed,
    })
    cart.clearCurrent()
    await Promise.all([catalog.refreshStock(), session.refreshPoints()])
    void router.replace(`/orders/${order.id}?new=1`)
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '下單失敗，請稍後再試'
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
      <p class="muted">購物車是空的。</p>
      <RouterLink to="/menu" class="btn">回菜單</RouterLink>
    </div>

    <div v-else class="layout">
      <div class="stack" style="--gap: 28px">
        <section class="stack">
          <h2>取餐門市</h2>
          <div class="card pad">
            <strong>{{ catalog.store?.name }}</strong>
            <p class="small muted">{{ catalog.store?.address }} · {{ catalog.store?.phone }}</p>
            <p class="small muted">要換門市請從上方選單切換。</p>
          </div>
        </section>

        <section class="stack">
          <h2>取餐方式</h2>
          <div class="chips">
            <button class="chip" :aria-pressed="fulfillment === 'pickup'" @click="fulfillment = 'pickup'">到店自取（免運）</button>
            <button class="chip" :aria-pressed="fulfillment === 'delivery'" @click="fulfillment = 'delivery'">外送（NT$60）</button>
          </div>
          <div v-if="fulfillment === 'delivery'" class="field">
            <label for="addr">配送地址</label>
            <input id="addr" v-model="address" class="input" autocomplete="street-address" />
            <p v-if="addressMissing" class="error">外送須填寫配送地址</p>
          </div>
        </section>

        <section class="stack">
          <h2>茶點數 <span class="en">Points</span></h2>
          <p class="small muted">目前 {{ session.points }} 點，本單最多折抵 {{ totals.maxPoints }} 點（上限為應付金額 50%）。</p>
          <div class="row">
            <input v-model.number="pointsInput" class="input pts" type="number" min="0" :max="totals.maxPoints" inputmode="numeric" aria-label="使用點數" />
            <button class="btn btn--small" @click="pointsInput = totals.maxPoints">全部使用</button>
            <button class="btn btn--small" @click="pointsInput = 0">不使用</button>
          </div>
        </section>
      </div>

      <aside class="card sum stack" style="--gap: 16px">
        <h2>訂單明細</h2>
        <ul class="items">
          <li v-for="i in cart.current" :key="i.id" class="row between small">
            <span>{{ catalog.productById(i.productId)?.name }} × {{ i.quantity }}</span>
          </li>
        </ul>
        <hr class="rule" style="margin:0" />
        <PriceBreakdown v-bind="totals" :discounts="totals.applied" :total="totals.total" />
        <p class="small muted">結案後可獲得 {{ totals.pointsEarned }} 點。付款驗證不在本系統範圍，按下確認即視為付款完成。</p>
        <p v-if="error" class="error" role="alert">{{ error }}</p>
        <button class="btn btn--primary" :disabled="busy || addressMissing" @click="place">{{ busy ? '送出中…' : '確認付款並下單' }}</button>
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
