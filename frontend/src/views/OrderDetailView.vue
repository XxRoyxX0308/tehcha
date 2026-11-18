<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import OrderStepper from '@/components/OrderStepper.vue'
import PriceBreakdown from '@/components/PriceBreakdown.vue'
import Seal from '@/components/Seal.vue'
import { api, ApiError } from '@/api'
import { canCancel } from '@/lib/pricing'
import { fmtDateTime, money } from '@/lib/format'
import { useCatalog } from '@/stores/catalog'
import { useSession } from '@/stores/session'
import type { Order, Review } from '@/types'

const route = useRoute()
const router = useRouter()
const session = useSession()
const catalog = useCatalog()

const order = ref<Order | null>(null)
const review = ref<Review | null>(null)
const error = ref('')
const rating = ref(5)
const comment = ref('')
const busy = ref(false)

const id = computed(() => Number(route.params.id))
const isNew = computed(() => route.query.new === '1')
const store = computed(() => catalog.stores.find((s) => s.id === order.value?.storeId))

async function refresh() {
  try {
    order.value = await api.getOrder(id.value, session.user!.userId)
    review.value = await api.getReviewForOrder(id.value)
    if (order.value.status === 'closed') await session.refreshPoints()
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '載入失敗'
  }
}

// OCS-F-005 / BMS-N-003: status should reach the customer within 3 seconds. Polling stands in for Redis push.
let timer: ReturnType<typeof setInterval> | undefined
onMounted(async () => {
  await refresh()
  timer = setInterval(() => { if (order.value && order.value.status !== 'closed') void refresh() }, 3000)
})
onBeforeUnmount(() => clearInterval(timer))

async function cancel() {
  if (!order.value || !confirm('確定要取消這筆訂單嗎？庫存與點數會一併還原。')) return
  try {
    await api.cancelOrder(order.value.id, session.user!.userId)
    await Promise.all([catalog.refreshStock(), session.refreshPoints()])
    void router.replace('/orders')
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '取消失敗'
  }
}

async function demoAdvance() {
  if (!order.value) return
  order.value = await api.demoAdvanceOrder(order.value.id, session.user!.userId)
  if (order.value.status === 'closed') await session.refreshPoints()
}

async function submitReview() {
  if (!order.value) return
  busy.value = true
  error.value = ''
  try {
    review.value = await api.addReview({ orderId: order.value.id, userId: session.user!.userId, rating: rating.value, comment: comment.value })
  } catch (e) {
    error.value = e instanceof ApiError ? e.message : '送出失敗'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page wrap stack" style="--gap: 28px">
    <RouterLink to="/orders" class="small">← 所有訂單</RouterLink>
    <p v-if="error && !order" class="error">{{ error }}</p>
    <p v-else-if="!order" class="muted">載入中…</p>

    <template v-else>
      <header class="head">
        <div class="stack" style="--gap: 6px">
          <p class="en">Order #{{ order.id }} · {{ store?.name }}</p>
          <h1>{{ isNew ? '訂單已成立' : '訂單狀態' }}</h1>
          <p class="muted small">{{ fmtDateTime(order.orderTime) }} · {{ order.fulfillment === 'pickup' ? '到店自取' : '外送到 ' + order.deliveryAddress }}</p>
        </div>
        <div class="ticket card" aria-label="取餐編號">
          <Seal :size="22" />
          <span class="en">取餐編號</span>
          <strong>{{ String(order.pickupNo).padStart(3, '0') }}</strong>
        </div>
      </header>

      <section class="card pad">
        <OrderStepper :status="order.status" :fulfillment="order.fulfillment" />
      </section>

      <div class="cols">
        <section class="stack">
          <h2>明細</h2>
          <ul class="items">
            <li v-for="i in order.items" :key="i.id">
              <div class="row between">
                <strong>{{ i.productName }} × {{ i.quantity }}</strong>
                <span class="price">{{ money((i.unitPrice + i.options.reduce((s, o) => s + o.extraPrice, 0)) * i.quantity) }}</span>
              </div>
              <p class="small muted">{{ i.options.map((o) => o.name).join('・') || '無客製' }}</p>
            </li>
          </ul>
        </section>
        <section class="card pad">
          <PriceBreakdown :subtotal="order.subtotal" :tax="order.tax" :shipping-fee="order.shippingFee" :discounts="order.discounts" :points-used="order.pointsUsed" :total="order.totalAmount" />
        </section>
      </div>

      <p v-if="error" class="error" role="alert">{{ error }}</p>

      <section class="row actions">
        <button v-if="canCancel(order.status)" class="btn btn--danger" @click="cancel">取消訂單</button>
        <p v-else-if="order.status !== 'closed'" class="small muted">訂單已進入製作，無法取消。</p>
      </section>

      <section v-if="order.status === 'closed'" class="card pad stack">
        <h2>門市評價 <span class="en">Review</span></h2>
        <template v-if="review">
          <p class="seal-line">{{ '★'.repeat(review.rating) }}{{ '☆'.repeat(5 - review.rating) }}</p>
          <p>{{ review.comment || '（沒有留言）' }}</p>
          <p class="small muted">感謝你的回饋。每筆訂單僅能評論一次。</p>
        </template>
        <form v-else class="stack" @submit.prevent="submitReview">
          <div class="chips" role="radiogroup" aria-label="評分">
            <button v-for="n in 5" :key="n" type="button" class="chip" role="radio" :aria-checked="rating === n" :aria-pressed="rating === n" @click="rating = n">{{ n }} 分</button>
          </div>
          <textarea v-model="comment" class="input" placeholder="說說這次的體驗（選填）" aria-label="評論內容"></textarea>
          <button class="btn btn--primary" :disabled="busy">送出評價</button>
        </form>
      </section>

      <section v-if="order.status !== 'closed'" class="demo small">
        <span class="muted">展示用：</span>
        <button class="btn btn--small" @click="demoAdvance">模擬店員推進狀態</button>
        <span class="muted">（員工端完成後移除）</span>
      </section>
    </template>
  </div>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
.ticket { display: grid; justify-items: center; gap: 2px; padding: 12px 22px; min-width: 120px; }
.ticket strong { font-family: var(--serif); font-size: 34px; color: var(--qinghua); line-height: 1.1; }
.pad { padding: 22px; }
.cols { display: grid; grid-template-columns: 1fr 340px; gap: 32px; align-items: start; }
.items { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.seal-line { color: var(--seal); font-size: 22px; letter-spacing: 4px; }
.actions { gap: 12px; }
.demo { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding-top: 12px; border-top: 1px dashed var(--line); }
h2 .en { margin-left: 8px; }
@media (max-width: 820px) { .cols { grid-template-columns: 1fr; } }
</style>
