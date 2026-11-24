<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import OrderStepper from '@/components/OrderStepper.vue'
import PriceBreakdown from '@/components/PriceBreakdown.vue'
import Seal from '@/components/Seal.vue'
import { http, errorText } from '@/api'
import { canCancel } from '@/lib/pricing'
import { fmtDateTime, money } from '@/lib/format'
import { useCatalog } from '@/stores/catalog'
import { useSession } from '@/stores/session'
import type { Order, OrderStatus } from '@/types'

// CUI-005 / OCS-F-005..007 and CUI-007 / SRMS-F-006.
const route = useRoute()
const router = useRouter()
const session = useSession()
const catalog = useCatalog()

const order = ref<Order | null>(null)
const error = ref('')
const rating = ref(5)
const comment = ref('')
const busy = ref(false)

const id = computed(() => Number(route.params.id))
const isNew = computed(() => route.query.new === '1')
const live = computed(() => !!order.value && !['closed', 'cancelled'].includes(order.value.status))

async function load() {
  try {
    order.value = await http.get<Order>(`/orders/${id.value}`)
    error.value = ''
  } catch (e) {
    error.value = errorText(e, '載入失敗')
  }
}

// OCS-F-005 / BMS-N-003: a status change reaches the customer within 3 seconds (polling stands in for Redis push)
let timer: ReturnType<typeof setInterval> | undefined
async function poll() {
  if (!live.value || document.hidden) return
  try {
    const { status } = await http.get<{ status: OrderStatus }>(`/orders/${id.value}/status`)
    if (status !== order.value?.status) {
      await load()
      if (status === 'closed') await session.refresh()
    }
  } catch { /* try again next tick */ }
}
onMounted(async () => {
  await load()
  timer = setInterval(poll, 3000)
})
onBeforeUnmount(() => clearInterval(timer))

async function cancel() {
  if (!order.value || !confirm('確定要取消這筆訂單嗎？庫存與點數會一併還原。')) return
  busy.value = true
  try {
    await http.post(`/orders/${order.value.id}/cancel`)
    await Promise.all([load(), catalog.refreshStock(), session.refresh()])
  } catch (e) {
    error.value = errorText(e, '取消失敗')
    await load()
  } finally {
    busy.value = false
  }
}

async function submitReview() {
  if (!order.value) return
  busy.value = true
  error.value = ''
  try {
    await http.post(`/orders/${order.value.id}/review`, { rating: rating.value, comment: comment.value })
    await load()
  } catch (e) {
    error.value = errorText(e, '送出失敗')
  } finally {
    busy.value = false
  }
}
const lineTotal = (i: Order['items'][number]) => (i.unitPrice + i.options.reduce((s, o) => s + o.extraPrice, 0)) * i.quantity
</script>

<template>
  <div class="page wrap stack" style="--gap: 28px">
    <RouterLink to="/orders" class="small back">← 所有訂單</RouterLink>
    <p v-if="error && !order" class="error">{{ error }}</p>
    <p v-else-if="!order" class="muted">載入中…</p>

    <template v-else>
      <header class="head">
        <div class="stack" style="--gap: 6px">
          <p class="en">Order #{{ order.id }} · {{ order.storeName }}</p>
          <h1>{{ order.status === 'cancelled' ? '訂單已取消' : isNew ? '訂單已成立' : '訂單狀態' }}</h1>
          <p class="muted small">{{ fmtDateTime(order.orderTime) }} · {{ order.fulfillment === 'pickup' ? '到店自取' : '外送到 ' + order.deliveryAddress }}</p>
        </div>
        <div class="ticket card" aria-label="取餐編號">
          <Seal :size="22" />
          <span class="en">取餐編號</span>
          <strong>{{ String(order.pickupNo).padStart(3, '0') }}</strong>
        </div>
      </header>

      <section v-if="order.status === 'cancelled'" class="notice">這筆訂單已取消，扣除的庫存與點數已還原。</section>
      <section v-else class="card pad">
        <OrderStepper :status="order.status" :fulfillment="order.fulfillment" :timeline="order.timeline" />
        <p v-if="live" class="small muted live">畫面會自動更新進度。</p>
      </section>

      <div class="cols">
        <section class="stack">
          <h2>明細</h2>
          <ul class="items">
            <li v-for="i in order.items" :key="i.id">
              <div class="row between">
                <strong>{{ i.productName }} × {{ i.quantity }}</strong>
                <span class="price">{{ money(lineTotal(i)) }}</span>
              </div>
              <p class="small muted">{{ i.options.map((o) => o.name + (o.extraPrice ? ` +${o.extraPrice}` : '')).join('・') || '無客製' }} · 單價 {{ money(i.unitPrice) }}</p>
            </li>
          </ul>
        </section>
        <section class="card pad stack" style="--gap: 12px">
          <PriceBreakdown :subtotal="order.subtotal" :tax="order.tax" :shipping-fee="order.shippingFee" :discounts="order.discounts" :points-used="order.pointsUsed" :total="order.totalAmount" />
          <p v-if="order.pointsEarned" class="small earned">結案已入帳 {{ order.pointsEarned }} 點</p>
          <p v-else-if="live" class="small muted">結案後可獲得 {{ Math.floor(order.totalAmount / 10) }} 點</p>
        </section>
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <section v-if="live" class="row actions">
        <button v-if="canCancel(order.status)" class="btn btn--danger" :disabled="busy" @click="cancel">取消訂單</button>
        <p v-else class="small muted">訂單已進入製作，無法取消。</p>
      </section>

      <section v-if="order.status === 'closed'" class="card pad stack">
        <h2>評價{{ order.storeName }} <span class="en">Review</span></h2>
        <template v-if="order.review">
          <p class="seal-line" :aria-label="`${order.review.rating} 星`">{{ '★'.repeat(order.review.rating) }}{{ '☆'.repeat(5 - order.review.rating) }}</p>
          <p>{{ order.review.comment || '（沒有留言）' }}</p>
          <p class="small muted">感謝你的回饋。每筆訂單僅能評論一次。<RouterLink to="/stores">看看其他人的評價</RouterLink></p>
        </template>
        <form v-else class="stack" @submit.prevent="submitReview">
          <div class="chips" role="radiogroup" aria-label="評分">
            <button v-for="n in 5" :key="n" type="button" class="chip" role="radio" :aria-checked="rating === n" :aria-pressed="rating === n" @click="rating = n">{{ n }} 分</button>
          </div>
          <textarea v-model="comment" class="input" maxlength="500" placeholder="說說這次的體驗（選填）" aria-label="評論內容"></textarea>
          <button class="btn btn--primary" style="justify-self: start" :disabled="busy">送出評價</button>
        </form>
      </section>

      <RouterLink v-if="order.status === 'closed' || order.status === 'cancelled'" class="btn" style="justify-self: start" to="/menu">再點一杯</RouterLink>
    </template>
  </div>
</template>

<style scoped>
.back { justify-self: start; }
.head { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
.ticket { display: grid; justify-items: center; gap: 2px; padding: 12px 22px; min-width: 120px; }
.ticket strong { font-family: var(--serif); font-size: 34px; color: var(--qinghua); line-height: 1.1; }
.pad { padding: 22px; }
.live { margin-top: 14px; text-align: center; }
.cols { display: grid; grid-template-columns: 1fr 340px; gap: 32px; align-items: start; }
.items { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.seal-line { color: var(--seal); font-size: 22px; letter-spacing: 4px; }
.earned { color: var(--qinghua); }
.actions { gap: 12px; }
h2 .en { margin-left: 8px; }
@media (max-width: 820px) { .cols { grid-template-columns: 1fr; } }
</style>
