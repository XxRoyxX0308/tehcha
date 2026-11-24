<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import Dialog from '@/components/console/Dialog.vue'
import { http, errorText } from '@/api'
import { useCatalog } from '@/stores/catalog'
import { useSession } from '@/stores/session'
import { useStaff } from '@/stores/staff'

// SUI-003 / PIS-F-003..006: the store's details and its stock. Stock at 0 shows as sold out on the
// menu; under the safety level it is flagged here and in the sidebar.
interface Row { productId: number; name: string; categoryId: number; isDeleted: boolean; stockQty: number; safetyQty: number; soldOut: boolean; low: boolean }

const staff = useStaff()
const session = useSession()
const catalog = useCatalog()
const rows = ref<Row[]>([])
const drafts = reactive<Record<number, { stockQty: number; safetyQty: number }>>({})
const filter = ref<'all' | 'low' | 'out'>('all')
const error = ref('')
const toast = ref('')
const saving = ref<number | null>(null)

async function load() {
  if (!staff.storeId) return
  try {
    rows.value = await http.get<Row[]>(`/staff/stores/${staff.storeId}/stock`)
    for (const r of rows.value) drafts[r.productId] = { stockQty: r.stockQty, safetyQty: r.safetyQty }
  } catch (e) { error.value = errorText(e) }
}
onMounted(load)
watch(() => staff.storeId, load)

const shown = computed(() => rows.value.filter((r) => !r.isDeleted && (filter.value === 'all' || (filter.value === 'low' ? r.low : r.soldOut))))
const counts = computed(() => ({ low: rows.value.filter((r) => !r.isDeleted && r.low).length, out: rows.value.filter((r) => !r.isDeleted && r.soldOut).length }))
const changed = (r: Row) => drafts[r.productId] && (drafts[r.productId].stockQty !== r.stockQty || drafts[r.productId].safetyQty !== r.safetyQty)

async function save(r: Row) {
  const d = drafts[r.productId]
  if (!Number.isInteger(d.stockQty) || d.stockQty < 0 || !Number.isInteger(d.safetyQty) || d.safetyQty < 0) {
    error.value = '庫存與安全庫存須為 0 以上的整數'
    return
  }
  saving.value = r.productId
  error.value = ''
  try {
    await http.put(`/staff/stores/${staff.storeId}/stock/${r.productId}`, d)
    flash(`「${r.name}」庫存已更新`)
    await Promise.all([load(), staff.refreshAlerts(), staff.storeId === catalog.storeId ? catalog.refreshStock() : null])
  } catch (e) { error.value = errorText(e) } finally { saving.value = null }
}
function restock(r: Row, n: number) { drafts[r.productId].stockQty = Math.max(0, (drafts[r.productId].stockQty || 0) + n) }

// ── store details (PIS-F-003) ──
const storeOpen = ref(false)
const creating = ref(false)
const sf = reactive({ name: '', address: '', contactEmail: '', phone: '' })
const storeError = ref('')
function editStore() {
  const s = staff.store
  if (!s) return
  Object.assign(sf, { name: s.name, address: s.address, contactEmail: s.contactEmail, phone: s.phone })
  creating.value = false; storeError.value = ''; storeOpen.value = true
}
function newStore() { Object.assign(sf, { name: '', address: '', contactEmail: '', phone: '' }); creating.value = true; storeError.value = ''; storeOpen.value = true }
async function saveStore() {
  storeError.value = ''
  try {
    if (creating.value) {
      const r = await http.post<{ id: number }>('/admin/stores', sf)
      await staff.load()
      staff.setStore(r.id)
      flash('門市已新增，所有商品已列入這間門市（庫存 0）')
    } else {
      await http.put(`/staff/stores/${staff.storeId}`, sf)
      await staff.load()
      flash('門市資料已更新')
    }
    storeOpen.value = false
    await catalog.load()
  } catch (e) { storeError.value = errorText(e) }
}
function flash(m: string) { toast.value = m; setTimeout(() => (toast.value = ''), 2400) }
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <header class="row between" style="flex-wrap: wrap">
      <div>
        <p class="en">Store & stock</p>
        <h1>門市與庫存</h1>
      </div>
      <button v-if="session.isAdmin" class="btn" @click="newStore">新增門市</button>
    </header>

    <section v-if="staff.store" class="panel store">
      <div>
        <h2>{{ staff.store.name }}</h2>
        <p class="small muted">{{ staff.store.address }} · {{ staff.store.phone }} · {{ staff.store.contactEmail }}</p>
      </div>
      <button class="btn btn--small" @click="editStore">編輯門市資料</button>
    </section>

    <section v-if="staff.alerts.length" class="notice notice--red" aria-live="polite">
      <strong>低於安全庫存（{{ staff.alerts.length }}）：</strong>
      <span v-for="(a, i) in staff.alerts" :key="`${a.storeId}-${a.productId}`">{{ i ? '、' : '' }}{{ a.storeName }}「{{ a.name }}」剩 {{ a.stockQty }}</span>
    </section>

    <div class="row" style="flex-wrap: wrap">
      <button class="chip" :aria-pressed="filter === 'all'" @click="filter = 'all'">全部</button>
      <button class="chip" :aria-pressed="filter === 'low'" @click="filter = 'low'">低於安全庫存 {{ counts.low }}</button>
      <button class="chip" :aria-pressed="filter === 'out'" @click="filter = 'out'">已售完 {{ counts.out }}</button>
    </div>
    <p v-if="error" class="notice notice--red" role="alert">{{ error }}</p>

    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>商品</th><th>狀態</th><th class="num">庫存（杯）</th><th class="num">安全庫存</th><th>快速補貨</th><th></th></tr></thead>
        <tbody>
          <tr v-for="r in shown" :key="r.productId">
            <td><strong>{{ r.name }}</strong></td>
            <td>
              <span v-if="r.soldOut" class="tag tag--red">已售完</span>
              <span v-else-if="r.low" class="tag tag--olive">庫存偏低</span>
              <span v-else class="tag">正常</span>
            </td>
            <td class="num"><input v-model.number="drafts[r.productId].stockQty" class="input input--sm qty" type="number" min="0" step="1" :aria-label="`${r.name} 庫存`" /></td>
            <td class="num"><input v-model.number="drafts[r.productId].safetyQty" class="input input--sm qty" type="number" min="0" step="1" :aria-label="`${r.name} 安全庫存`" /></td>
            <td class="quick">
              <button class="btn btn--small btn--ghost" @click="restock(r, 10)">+10</button>
              <button class="btn btn--small btn--ghost" @click="restock(r, 50)">+50</button>
            </td>
            <td class="num"><button class="btn btn--small" :class="{ 'btn--primary': changed(r) }" :disabled="!changed(r) || saving === r.productId" @click="save(r)">儲存</button></td>
          </tr>
          <tr v-if="!shown.length"><td colspan="6" class="muted">沒有符合的商品</td></tr>
        </tbody>
      </table>
    </div>

    <Dialog v-if="storeOpen" :title="creating ? '新增門市' : '編輯門市資料'" @close="storeOpen = false">
      <form class="stack" style="--gap: 14px" novalidate @submit.prevent="saveStore">
        <div class="field"><label for="sn">門市名稱</label><input id="sn" v-model="sf.name" class="input" maxlength="50" /></div>
        <div class="field"><label for="sa">地址</label><input id="sa" v-model="sf.address" class="input" maxlength="200" /></div>
        <div class="form-grid">
          <div class="field"><label for="se">聯絡 E-mail</label><input id="se" v-model="sf.contactEmail" class="input" type="email" maxlength="100" /></div>
          <div class="field"><label for="sp">電話</label><input id="sp" v-model="sf.phone" class="input" type="tel" maxlength="20" /></div>
        </div>
        <p v-if="storeError" class="error" role="alert">{{ storeError }}</p>
        <button class="btn btn--primary" style="justify-self: start">{{ creating ? '新增門市' : '儲存' }}</button>
      </form>
    </Dialog>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped>
.store { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
.qty { width: 96px; text-align: right; }
.quick { white-space: nowrap; }
.quick .btn { padding: 0 10px; }
</style>
