<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import Dialog from '@/components/console/Dialog.vue'
import { http, errorText } from '@/api'
import { DISCOUNT_TYPE_LABEL, discountLabel, money, shiftDate, todayStr } from '@/lib/format'
import { useCatalog } from '@/stores/catalog'
import type { Discount, DiscountType, Product } from '@/types'

// SUI-004: shipping, seasonal and special-event policies. The system assigns each code; the three
// types stack on one order; a product can't be in two special events at the same time.
const catalog = useCatalog()
const list = ref<Discount[]>([])
const products = ref<Product[]>([])
const error = ref('')
const toast = ref('')
const typeFilter = ref<'' | DiscountType>('')

async function load() {
  try {
    ;[list.value, products.value] = await Promise.all([http.get<Discount[]>('/staff/discounts'), http.get<Product[]>('/staff/products')])
  } catch (e) { error.value = errorText(e) }
}
onMounted(load)
const shown = computed(() => list.value.filter((d) => !typeFilter.value || d.type === typeFilter.value))
const productName = (id: number) => products.value.find((p) => p.id === id)?.name ?? `#${id}`
const STATE = { active: ['進行中', 'tag--blue'], upcoming: ['尚未開始', 'tag--olive'], ended: ['已結束', ''] } as const

function rule(d: Discount) {
  if (d.type === 'shipping') return `消費滿 ${money(d.minPurchaseAmount ?? 0)} 免運`
  if (d.type === 'seasonal') return `全單 ${discountLabel(d.discountRate ?? 0)}${d.minPurchaseAmount ? `（滿 ${money(d.minPurchaseAmount)}）` : ''}`
  return d.ruleType === 'buy1get1' ? '買一送一' : `${discountLabel(d.discountRate ?? 0)}`
}

// ── form ──
const blank = () => ({
  type: 'seasonal' as DiscountType, description: '', startDate: todayStr(), endDate: shiftDate(todayStr(), 30),
  percentOff: 10, ruleType: 'rate' as 'rate' | 'buy1get1', minPurchaseAmount: 500, useMin: false, productIds: [] as number[],
})
const f = reactive(blank())
const editing = ref<Discount | null>(null)
const open = ref(false)
const formError = ref('')
const saving = ref(false)

function create() { Object.assign(f, blank()); editing.value = null; formError.value = ''; open.value = true }
function edit(d: Discount) {
  Object.assign(f, {
    type: d.type, description: d.description, startDate: d.startDate, endDate: d.endDate,
    percentOff: d.discountRate ? Math.round(d.discountRate * 1000) / 10 : 10, ruleType: d.ruleType ?? 'rate',
    minPurchaseAmount: d.minPurchaseAmount ?? 500, useMin: d.minPurchaseAmount != null, productIds: [...d.productIds],
  })
  editing.value = d; formError.value = ''; open.value = true
}
const toggleProduct = (id: number) => { f.productIds = f.productIds.includes(id) ? f.productIds.filter((x) => x !== id) : [...f.productIds, id] }

async function save() {
  formError.value = ''
  if (f.endDate < f.startDate) { formError.value = '結束日期不可早於開始日期'; return }
  const rate = Math.round(Number(f.percentOff) * 10) / 1000
  const body = {
    type: f.type, description: f.description, startDate: f.startDate, endDate: f.endDate,
    discountRate: f.type === 'seasonal' || (f.type === 'special_event' && f.ruleType === 'rate') ? rate : null,
    ruleType: f.type === 'special_event' ? f.ruleType : null,
    minPurchaseAmount: f.type === 'shipping' || (f.type === 'seasonal' && f.useMin) ? Number(f.minPurchaseAmount) : null,
    productIds: f.type === 'special_event' ? f.productIds : [],
  }
  saving.value = true
  try {
    if (editing.value) await http.put(`/staff/discounts/${editing.value.code}`, body)
    else { const r = await http.post<{ code: string }>('/staff/discounts', body); flash(`已建立，折扣代碼 ${r.code}`) }
    open.value = false
    await Promise.all([load(), catalog.load()])
  } catch (e) { formError.value = errorText(e) } finally { saving.value = false }
}

async function remove(d: Discount) {
  if (!confirm(`刪除折扣「${d.description}」（${d.code}）？已套用的訂單會保留紀錄。`)) return
  try { await http.del(`/staff/discounts/${d.code}`); await Promise.all([load(), catalog.load()]); flash('已刪除') } catch (e) { error.value = errorText(e) }
}
function flash(m: string) { toast.value = m; setTimeout(() => (toast.value = ''), 3000) }
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <header class="row between" style="flex-wrap: wrap">
      <div>
        <p class="en">Discount policies</p>
        <h1>折扣政策</h1>
      </div>
      <button class="btn btn--primary" @click="create">新增折扣</button>
    </header>
    <p class="small muted">三類折扣可同時套用於同一筆訂單：先算特殊活動（商品層級），再算季節折扣與運費折扣（訂單層級）。結帳時自動套用，並逐項列出。</p>

    <div class="row" style="flex-wrap: wrap">
      <button class="chip" :aria-pressed="typeFilter === ''" @click="typeFilter = ''">全部</button>
      <button v-for="(label, t) in DISCOUNT_TYPE_LABEL" :key="t" class="chip" :aria-pressed="typeFilter === t" @click="typeFilter = t">{{ label }}</button>
    </div>
    <p v-if="error" class="notice notice--red" role="alert">{{ error }}</p>

    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>代碼</th><th>類型</th><th>說明</th><th>規則</th><th>期間</th><th>狀態</th><th class="num">已套用</th><th></th></tr></thead>
        <tbody>
          <tr v-for="d in shown" :key="d.code" :class="{ 'is-muted': d.state === 'ended' }">
            <td><code>{{ d.code }}</code></td>
            <td>{{ DISCOUNT_TYPE_LABEL[d.type] }}</td>
            <td>{{ d.description }}<br v-if="d.productIds.length" /><span v-if="d.productIds.length" class="small muted">{{ d.productIds.map(productName).join('、') }}</span></td>
            <td>{{ rule(d) }}</td>
            <td class="small nowrap">{{ d.startDate }}<br />至 {{ d.endDate }}</td>
            <td><span class="tag" :class="STATE[d.state ?? 'active'][1]">{{ STATE[d.state ?? 'active'][0] }}</span></td>
            <td class="num small">{{ d.orderCount }} 筆<br /><span class="muted">{{ money(d.amountGiven ?? 0) }}</span></td>
            <td class="acts"><button class="linkbtn" @click="edit(d)">編輯</button><button class="linkbtn linkbtn--red" @click="remove(d)">刪除</button></td>
          </tr>
          <tr v-if="!shown.length"><td colspan="8" class="muted">沒有折扣政策</td></tr>
        </tbody>
      </table>
    </div>

    <Dialog v-if="open" :title="editing ? `編輯 ${editing.code}` : '新增折扣政策'" wide @close="open = false">
      <form class="stack" style="--gap: 16px" novalidate @submit.prevent="save">
        <fieldset class="types" :disabled="!!editing">
          <legend class="small muted">類型{{ editing ? '（建立後不可更改）' : '' }}</legend>
          <label v-for="(label, t) in DISCOUNT_TYPE_LABEL" :key="t" class="check"><input v-model="f.type" type="radio" :value="t" /> {{ label }}</label>
        </fieldset>
        <div class="field"><label for="dd">說明</label><input id="dd" v-model="f.description" class="input" maxlength="200" placeholder="例如：冬日暖茶季 全單 95 折" /></div>
        <div class="form-grid">
          <div class="field"><label for="ds">開始日期</label><input id="ds" v-model="f.startDate" class="input" type="date" /></div>
          <div class="field"><label for="de">結束日期</label><input id="de" v-model="f.endDate" class="input" type="date" :min="f.startDate" /></div>
        </div>

        <template v-if="f.type === 'shipping'">
          <div class="field"><label for="dm">消費金額門檻（NT$，達到即免運）</label><input id="dm" v-model.number="f.minPurchaseAmount" class="input" type="number" min="0" /></div>
        </template>

        <template v-else-if="f.type === 'seasonal'">
          <div class="form-grid">
            <div class="field"><label for="dr">折扣（% off）</label><input id="dr" v-model.number="f.percentOff" class="input" type="number" min="0.1" max="100" step="0.5" />
              <span class="small muted">= {{ discountLabel((f.percentOff || 0) / 100) }}</span></div>
            <div class="field"><label class="check" for="du"><input id="du" v-model="f.useMin" type="checkbox" /> 設定消費門檻</label>
              <input v-if="f.useMin" v-model.number="f.minPurchaseAmount" class="input" type="number" min="0" aria-label="消費門檻" /></div>
          </div>
        </template>

        <template v-else>
          <div class="row" style="flex-wrap: wrap">
            <label class="check"><input v-model="f.ruleType" type="radio" value="rate" /> 折扣率</label>
            <label class="check"><input v-model="f.ruleType" type="radio" value="buy1get1" /> 買一送一</label>
            <template v-if="f.ruleType === 'rate'">
              <input v-model.number="f.percentOff" class="input input--sm pct" type="number" min="0.1" max="100" step="0.5" aria-label="折扣百分比" /> % off
              <span class="small muted">= {{ discountLabel((f.percentOff || 0) / 100) }}</span>
            </template>
          </div>
          <fieldset class="prods">
            <legend class="small muted">適用商品（同一商品同一期間只能有一個特殊活動）</legend>
            <label v-for="p in products.filter((x) => !x.isDeleted)" :key="p.id" class="check"><input type="checkbox" :checked="f.productIds.includes(p.id)" @change="toggleProduct(p.id)" /> {{ p.name }}</label>
          </fieldset>
        </template>

        <p v-if="formError" class="error" role="alert">{{ formError }}</p>
        <div class="row">
          <button class="btn btn--primary" :disabled="saving">{{ saving ? '儲存中…' : editing ? '儲存' : '建立並產生代碼' }}</button>
          <button type="button" class="btn btn--ghost" @click="open = false">取消</button>
        </div>
      </form>
    </Dialog>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped>
code { font-size: 13px; background: var(--paper-deep); padding: 1px 6px; border-radius: 3px; }
.nowrap { white-space: nowrap; }
.acts { white-space: nowrap; text-align: right; }
.acts > * + * { margin-left: 14px; }
.types, .prods { border: 1px solid var(--line); border-radius: 4px; padding: 10px 14px 14px; margin: 0; display: flex; flex-wrap: wrap; gap: 10px 20px; }
.types legend, .prods legend { padding: 0 6px; }
.pct { width: 90px; }
</style>
