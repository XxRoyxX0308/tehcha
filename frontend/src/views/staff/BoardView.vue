<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { http, errorText, ApiError } from '@/api'
import { useStaff } from '@/stores/staff'
import { maskTime, minutesAgo, money } from '@/lib/format'
import type { Order, OrderStatus } from '@/types'

// SUI-001 / OCS-F-004: the store's live orders. New ones stand out; one click moves an order a step.
const staff = useStaff()
const orders = ref<Order[]>([])
const loaded = ref(false)
const error = ref('')
const busy = ref<number | null>(null)
const seen = new Set<number>()
const fresh = ref<Set<number>>(new Set())
const now = ref(Date.now())

const COLUMNS: { status: OrderStatus; title: string; en: string; action: string }[] = [
  { status: 'received', title: '新進訂單', en: 'Received', action: '開始製作' },
  { status: 'processing', title: '製作中', en: 'Brewing', action: '完成出杯' },
  { status: 'shipping', title: '待取 / 配送中', en: 'Ready', action: '已取餐，結案' },
]
const byStatus = (s: OrderStatus) => orders.value.filter((o) => o.status === s)
const done = computed(() => orders.value.filter((o) => o.status === 'closed' || o.status === 'cancelled').reverse())
const todaySales = computed(() => orders.value.filter((o) => o.status !== 'cancelled').reduce((s, o) => s + o.totalAmount, 0))

async function refresh() {
  if (!staff.storeId) return
  try {
    const list = await http.get<Order[]>(`/staff/stores/${staff.storeId}/board`)
    // anything we had not seen before is new (except on the first load)
    if (loaded.value) for (const o of list) if (!seen.has(o.id) && o.status === 'received') fresh.value.add(o.id)
    for (const o of list) seen.add(o.id)
    fresh.value = new Set([...fresh.value].filter((id) => list.some((o) => o.id === id && o.status === 'received')))
    orders.value = list
    loaded.value = true
    error.value = ''
  } catch (e) {
    error.value = errorText(e, '無法載入訂單')
  }
}

async function advance(o: Order) {
  busy.value = o.id
  try {
    await http.post(`/staff/orders/${o.id}/advance`, { from: o.status })
    fresh.value.delete(o.id)
  } catch (e) {
    if (!(e instanceof ApiError && e.code === 'stale')) error.value = errorText(e)
  } finally {
    busy.value = null
    await refresh()
  }
}

// BMS-N-003: the board catches up within 3 seconds
let timer: ReturnType<typeof setInterval> | undefined
let clock: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  void refresh()
  timer = setInterval(() => { if (!document.hidden) void refresh() }, 3000)
  clock = setInterval(() => { now.value = Date.now() }, 30000)
})
onBeforeUnmount(() => { clearInterval(timer); clearInterval(clock); document.title = '訂單看板｜得茶 Tehcha' })
watch(() => staff.storeId, () => { seen.clear(); fresh.value = new Set(); loaded.value = false; orders.value = []; void refresh() })
watch(() => fresh.value.size, (n) => { document.title = n ? `(${n}) 新訂單｜得茶 Tehcha` : '訂單看板｜得茶 Tehcha' })

const opts = (o: Order['items'][number]) => o.options.map((x) => x.name).join('・')
</script>

<template>
  <div class="board stack" style="--gap: 20px">
    <header class="head">
      <div>
        <p class="en">Order board · {{ staff.store?.name }}</p>
        <h1>訂單看板</h1>
      </div>
      <dl class="kpis">
        <div><dt>進行中</dt><dd>{{ orders.length - done.length }}</dd></div>
        <div><dt>今日完成</dt><dd>{{ done.filter((o) => o.status === 'closed').length }}</dd></div>
        <div><dt>今日營收</dt><dd>{{ money(todaySales) }}</dd></div>
      </dl>
    </header>

    <p v-if="error" class="notice notice--red" role="alert">{{ error }}</p>
    <p v-if="!loaded && !error" class="muted">載入中…</p>

    <div v-else class="cols">
      <section v-for="col in COLUMNS" :key="col.status" class="col" :aria-label="col.title">
        <h2>{{ col.title }} <span class="count">{{ byStatus(col.status).length }}</span></h2>
        <p v-if="!byStatus(col.status).length" class="small muted empty">目前沒有訂單</p>
        <article v-for="o in byStatus(col.status)" :key="o.id" class="ticket" :class="{ fresh: fresh.has(o.id), late: col.status !== 'shipping' && minutesAgo(o.orderTime, now) >= 15 }">
          <header class="ticket__head">
            <strong class="no">{{ String(o.pickupNo).padStart(3, '0') }}</strong>
            <span v-if="fresh.has(o.id)" class="tag tag--red">新</span>
            <span class="tag" :class="o.fulfillment === 'delivery' ? 'tag--olive' : ''">{{ o.fulfillment === 'delivery' ? '外送' : '自取' }}</span>
            <span class="time small muted">{{ maskTime(o.orderTime) }} · {{ minutesAgo(o.orderTime, now) }} 分鐘前</span>
          </header>
          <ul class="items">
            <li v-for="i in o.items" :key="i.id">
              <span><b>{{ i.productName }}</b> × {{ i.quantity }}</span>
              <span class="small muted">{{ opts(i) || '無客製' }}</span>
            </li>
          </ul>
          <p class="small muted who">{{ o.customerName }}<template v-if="o.deliveryAddress"> · {{ o.deliveryAddress }}</template> · {{ money(o.totalAmount) }}</p>
          <button class="btn btn--small" :class="{ 'btn--primary': col.status === 'received' }" :disabled="busy === o.id" @click="advance(o)">
            {{ busy === o.id ? '更新中…' : col.action }} →
          </button>
        </article>
      </section>

      <section class="col col--done" aria-label="今日已結案與取消">
        <h2>今日已完成 <span class="count">{{ done.length }}</span></h2>
        <p v-if="!done.length" class="small muted empty">今天還沒有結案的訂單</p>
        <ul class="donelist">
          <li v-for="o in done" :key="o.id" :class="{ cancelled: o.status === 'cancelled' }">
            <strong>{{ String(o.pickupNo).padStart(3, '0') }}</strong>
            <span class="small">{{ o.items.map((i) => `${i.productName}×${i.quantity}`).join('、') }}</span>
            <span class="small muted">{{ o.status === 'cancelled' ? '已取消' : money(o.totalAmount) }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.head { display: flex; justify-content: space-between; align-items: end; gap: 20px; flex-wrap: wrap; }
.kpis { display: flex; gap: 28px; margin: 0; }
.kpis div { display: grid; }
.kpis dt { font-size: 13px; color: var(--tea); }
.kpis dd { margin: 0; font-family: var(--serif); font-size: 24px; color: var(--qinghua); font-weight: 700; font-variant-numeric: tabular-nums; }
.cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 0.8fr); gap: 16px; align-items: start; }
.col { display: grid; gap: 12px; padding: 14px; background: var(--paper-deep); border: 1px solid var(--line); border-radius: 4px; min-height: 240px; align-content: start; }
.col h2 { font-size: 17px; display: flex; align-items: center; gap: 8px; }
.count { font-family: var(--sans); font-size: 12px; min-width: 22px; height: 22px; padding: 0 7px; border-radius: 11px; background: var(--paper); border: 1px solid var(--line); display: inline-grid; place-items: center; color: var(--ink); }
.empty { padding: 8px 2px; }
.ticket { display: grid; gap: 10px; padding: 14px; background: var(--paper); border: 1px solid var(--line); border-radius: 4px; transition: border-color 0.2s; }
.ticket.fresh { border-color: var(--seal); box-shadow: 0 0 0 3px #f1d6cf; animation: ping 1.2s ease-out 2; }
.ticket.late .time { color: var(--seal); }
.ticket__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.no { font-family: var(--serif); font-size: 26px; color: var(--qinghua); line-height: 1; margin-right: 4px; }
.time { margin-left: auto; }
.items { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
.items li { display: grid; }
.who { border-top: 1px dashed var(--line); padding-top: 8px; }
.ticket .btn { justify-self: stretch; }
.donelist { list-style: none; margin: 0; padding: 0; display: grid; }
.donelist li { display: grid; grid-template-columns: auto 1fr; gap: 2px 10px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.donelist li .muted { grid-column: 2; }
.donelist strong { font-family: var(--serif); color: var(--tea); grid-row: span 2; }
.donelist .cancelled { opacity: 0.6; text-decoration: line-through; }
@keyframes ping { 0% { box-shadow: 0 0 0 0 rgba(163, 42, 47, 0.45); } 100% { box-shadow: 0 0 0 10px rgba(163, 42, 47, 0); } }
@media (max-width: 1180px) { .cols { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .cols { grid-template-columns: 1fr; } .col { min-height: 0; } }
</style>
