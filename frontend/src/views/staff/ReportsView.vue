<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import BarChart from '@/components/console/BarChart.vue'
import { http, errorText } from '@/api'
import { money, shiftDate, todayStr } from '@/lib/format'
import { useStaff } from '@/stores/staff'

// SUI-005 / SRS-F-001..005: sales by period, best sellers per store, purchases per product or
// store, by hour and by category. Every table exports to CSV. Cancelled orders never count.
interface SalesRow { period: string; storeId: number; storeName: string; orders: number; sales: number; avgTicket: number }
interface BestRow { storeId: number; storeName: string; productId: number; name: string; qty: number; revenue: number; rank: number }
interface HourRow { hour: number; orders: number; sales: number; cups: number }
interface CatRow { categoryId: number; name: string; qty: number; revenue: number; share: number | null }
type PurchaseRow = Record<string, string | number>

const staff = useStaff()
const f = reactive({ preset: '30' as '7' | '30' | '90' | 'custom', from: shiftDate(todayStr(), -29), to: todayStr(), storeId: 0 })
const period = ref<'day' | 'week' | 'month'>('day')
const by = ref<'product' | 'store'>('product')
const error = ref('')
const loading = ref(false)

const summary = ref<{ orders: number; sales: number; avgTicket: number; customers: number; cups: number } | null>(null)
const sales = ref<SalesRow[]>([])
const best = ref<BestRow[]>([])
const hourly = ref<HourRow[]>([])
const cats = ref<CatRow[]>([])
const purchases = ref<PurchaseRow[]>([])

const range = computed(() => ({ from: f.from, to: f.to, storeId: f.storeId || undefined }))
watch(() => f.preset, (p) => { if (p !== 'custom') { f.to = todayStr(); f.from = shiftDate(f.to, -(Number(p) - 1)) } })

async function load() {
  if (f.from > f.to) { error.value = '開始日期不可晚於結束日期'; return }
  loading.value = true
  error.value = ''
  try {
    const r = range.value
    const [s, a, b, h, c, p] = await Promise.all([
      http.get<typeof summary.value>('/staff/reports/summary', r),
      http.get<{ rows: SalesRow[] }>('/staff/reports/sales', { ...r, period: period.value }),
      http.get<{ rows: BestRow[] }>('/staff/reports/best-sellers', { ...r, top: 5 }),
      http.get<{ rows: HourRow[] }>('/staff/reports/hourly', r),
      http.get<{ rows: CatRow[] }>('/staff/reports/category', r),
      http.get<{ rows: PurchaseRow[] }>('/staff/reports/purchases', { ...r, by: by.value }),
    ])
    summary.value = s; sales.value = a.rows; best.value = b.rows; hourly.value = h.rows; cats.value = c.rows; purchases.value = p.rows
  } catch (e) { error.value = errorText(e, '無法載入報表') } finally { loading.value = false }
}
onMounted(load)
watch([range, period, by], load)

const csv = (kind: string, extra: Record<string, string> = {}) => http.href(`/staff/reports/${kind}`, { ...range.value, ...extra, format: 'csv' })

// chart data: total of all selected stores per period
const salesSeries = computed(() => {
  const m = new Map<string, { sales: number; orders: number }>()
  for (const r of sales.value) {
    const x = m.get(r.period) ?? { sales: 0, orders: 0 }
    x.sales += r.sales; x.orders += r.orders
    m.set(r.period, x)
  }
  return [...m].map(([k, v]) => ({ label: period.value === 'month' ? k.slice(0, 7) : k.slice(5).replace('-', '/'), value: v.sales, detail: `${v.orders} 筆訂單` }))
})
const hourSeries = computed(() => {
  const open = hourly.value.filter((h) => h.hour >= 8 && h.hour <= 22)
  return open.map((h) => ({ label: `${h.hour}`, value: h.orders, detail: `${money(h.sales)} · ${h.cups} 杯` }))
})
const catSeries = computed(() => cats.value.map((c) => ({ label: c.name, value: c.qty, detail: `${c.share ?? 0}% · ${money(c.revenue)}` })))
const bestByStore = computed(() => {
  const m = new Map<string, BestRow[]>()
  for (const r of best.value) m.set(r.storeName, [...(m.get(r.storeName) ?? []), r])
  return [...m]
})
const short = (v: number) => (v >= 10000 ? `${(v / 1000).toFixed(0)}k` : v.toLocaleString('en-US'))
</script>

<template>
  <div class="stack" style="--gap: 24px">
    <header>
      <p class="en">Sales reports</p>
      <h1>銷售報表</h1>
    </header>

    <div class="filters panel">
      <div class="row" style="flex-wrap: wrap">
        <button v-for="p in ['7', '30', '90']" :key="p" class="chip" :aria-pressed="f.preset === p" @click="f.preset = p as '7'">近 {{ p }} 天</button>
        <button class="chip" :aria-pressed="f.preset === 'custom'" @click="f.preset = 'custom'">自訂</button>
      </div>
      <div class="row" style="flex-wrap: wrap">
        <label class="small">從 <input v-model="f.from" class="input input--sm" type="date" :disabled="f.preset !== 'custom'" aria-label="開始日期" /></label>
        <label class="small">到 <input v-model="f.to" class="input input--sm" type="date" :disabled="f.preset !== 'custom'" aria-label="結束日期" /></label>
        <select v-model.number="f.storeId" class="input input--sm store" aria-label="門市">
          <option :value="0">我負責的所有門市</option>
          <option v-for="s in staff.stores" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
      </div>
    </div>

    <p v-if="error" class="notice notice--red" role="alert">{{ error }}</p>

    <dl v-if="summary" class="tiles" :aria-busy="loading">
      <div><dt>總銷售額</dt><dd>{{ money(summary.sales) }}</dd></div>
      <div><dt>訂單數</dt><dd>{{ summary.orders.toLocaleString() }}</dd></div>
      <div><dt>平均客單價</dt><dd>{{ money(summary.avgTicket) }}</dd></div>
      <div><dt>售出杯數</dt><dd>{{ summary.cups.toLocaleString() }}</dd></div>
      <div><dt>消費會員</dt><dd>{{ summary.customers.toLocaleString() }}</dd></div>
    </dl>

    <!-- SRS-F-001 -->
    <section class="panel stack" style="--gap: 14px">
      <div class="sec-head">
        <h2>銷售額趨勢</h2>
        <div class="row">
          <button v-for="[k, l] in [['day', '日'], ['week', '週'], ['month', '月']]" :key="k" class="chip" :aria-pressed="period === k" @click="period = k as 'day'">{{ l }}</button>
          <a class="btn btn--small" :href="csv('sales', { period })" download>匯出 CSV</a>
        </div>
      </div>
      <BarChart v-if="salesSeries.length" :data="salesSeries" :format="short" label="各期間銷售額" />
      <p v-else class="muted small">這段期間沒有銷售。</p>
      <details>
        <summary class="small">依門市的明細（{{ sales.length }} 列）</summary>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>日期</th><th>門市名稱</th><th class="num">訂單數</th><th class="num">總銷售額</th><th class="num">平均客單價</th></tr></thead>
            <tbody><tr v-for="r in sales" :key="r.period + r.storeId"><td>{{ r.period }}</td><td>{{ r.storeName }}</td><td class="num">{{ r.orders }}</td><td class="num">{{ money(r.sales) }}</td><td class="num">{{ money(r.avgTicket) }}</td></tr></tbody>
          </table>
        </div>
      </details>
    </section>

    <div class="two">
      <!-- SRS-F-004: time slot -->
      <section class="panel stack" style="--gap: 14px">
        <div class="sec-head"><h2>各時段訂單數</h2><a class="btn btn--small" :href="csv('hourly')" download>匯出 CSV</a></div>
        <BarChart :data="hourSeries" label="每小時訂單數（8 至 22 時）" :height="200" />
        <p class="small muted">橫軸為時（24 小時制），依台北時間。</p>
      </section>
      <!-- SRS-F-004: category -->
      <section class="panel stack" style="--gap: 14px">
        <div class="sec-head"><h2>各分類杯數</h2><a class="btn btn--small" :href="csv('category')" download>匯出 CSV</a></div>
        <BarChart :data="catSeries" horizontal label="各分類售出杯數" />
        <table class="table mini">
          <thead><tr><th>分類</th><th class="num">杯數</th><th class="num">占比</th><th class="num">商品營收</th></tr></thead>
          <tbody><tr v-for="c in cats" :key="c.categoryId"><td>{{ c.name }}</td><td class="num">{{ c.qty }}</td><td class="num">{{ c.share ?? 0 }}%</td><td class="num">{{ money(c.revenue) }}</td></tr></tbody>
        </table>
      </section>
    </div>

    <!-- SRS-F-002 -->
    <section class="panel stack" style="--gap: 14px">
      <div class="sec-head"><h2>各門市暢銷商品</h2><a class="btn btn--small" :href="csv('best-sellers', { top: '5' })" download>匯出 CSV</a></div>
      <div class="stores">
        <div v-for="[name, rows] in bestByStore" :key="name">
          <h3>{{ name }}</h3>
          <ol class="rank">
            <li v-for="r in rows" :key="r.productId"><span class="n">{{ r.rank }}</span><span>{{ r.name }}</span><span class="small muted">{{ r.qty }} 杯</span></li>
          </ol>
        </div>
      </div>
    </section>

    <!-- SRS-F-003 + product ranking (SRS-F-004) -->
    <section class="panel stack" style="--gap: 14px">
      <div class="sec-head">
        <h2>購買統計</h2>
        <div class="row">
          <button class="chip" :aria-pressed="by === 'product'" @click="by = 'product'">每個商品</button>
          <button class="chip" :aria-pressed="by === 'store'" @click="by = 'store'">每間門市</button>
          <a class="btn btn--small" :href="csv('purchases', { by })" download>匯出 CSV</a>
        </div>
      </div>
      <div class="table-wrap">
        <table v-if="by === 'product'" class="table">
          <thead><tr><th class="num">排名</th><th>商品</th><th>分類</th><th class="num">杯數</th><th class="num">訂單數</th><th class="num">購買人數</th><th class="num">商品營收</th></tr></thead>
          <tbody><tr v-for="(r, i) in purchases" :key="r.productId"><td class="num">{{ i + 1 }}</td><td>{{ r.name }}</td><td>{{ r.category }}</td><td class="num">{{ r.qty }}</td><td class="num">{{ r.orders }}</td><td class="num">{{ r.buyers }}</td><td class="num">{{ money(Number(r.revenue)) }}</td></tr></tbody>
        </table>
        <table v-else class="table">
          <thead><tr><th>門市</th><th class="num">訂單數</th><th class="num">杯數</th><th class="num">顧客數</th><th class="num">總銷售額</th><th class="num">平均客單價</th><th class="num">折扣</th><th class="num">點數折抵</th></tr></thead>
          <tbody><tr v-for="r in purchases" :key="r.storeId"><td>{{ r.storeName }}</td><td class="num">{{ r.orders }}</td><td class="num">{{ r.cups }}</td><td class="num">{{ r.customers }}</td><td class="num">{{ money(Number(r.sales)) }}</td><td class="num">{{ money(Number(r.avgTicket)) }}</td><td class="num">{{ money(Number(r.discounts)) }}</td><td class="num">{{ r.pointsUsed }}</td></tr></tbody>
        </table>
      </div>
      <p class="small muted">商品營收為折扣前金額（含客製化加價）；總銷售額為顧客實付金額。</p>
    </section>
  </div>
</template>

<style scoped>
.filters { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center; padding: 14px 16px; }
.filters label { display: inline-flex; align-items: center; gap: 6px; }
.filters .input { width: auto; }
.store { min-width: 180px; }
.tiles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; margin-inline: 0; margin-bottom: 0; }
.tiles div { padding: 16px; background: var(--paper-deep); border: 1px solid var(--line); border-radius: 4px; }
.tiles dt { font-size: 13px; color: var(--tea); }
.tiles dd { margin: 4px 0 0; font-family: var(--serif); font-size: clamp(20px, 2.2vw, 28px); font-weight: 700; color: var(--qinghua); font-variant-numeric: tabular-nums; }
.sec-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
.sec-head h2 { font-size: 20px; }
.two { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; align-items: start; }
.mini { font-size: 13px; }
.stores { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; }
.stores h3 { font-size: 16px; margin-bottom: 6px; }
.rank { list-style: none; margin: 0; padding: 0; }
.rank li { display: grid; grid-template-columns: 26px 1fr auto; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); align-items: baseline; }
.rank .n { font-family: var(--serif); color: var(--qinghua); font-weight: 700; }
details summary { cursor: pointer; color: var(--qinghua); margin-bottom: 10px; }
@media (max-width: 1100px) { .tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } .two { grid-template-columns: 1fr; } }
@media (max-width: 560px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
