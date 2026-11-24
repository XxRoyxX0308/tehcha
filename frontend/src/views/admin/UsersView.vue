<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import Dialog from '@/components/console/Dialog.vue'
import { http, errorText } from '@/api'
import { fmtDate, fmtDateTime, money, ROLE_LABEL, STATUS_LABEL } from '@/lib/format'
import { useCatalog } from '@/stores/catalog'
import { useSession } from '@/stores/session'
import type { OrderStatus, Role } from '@/types'

// AUI-001 / UMS-F-005, UMS-F-006: accounts, roles and store assignments; warnings, suspension and
// disabling. Accounts are never deleted (UMS-F-007).
interface UserRow {
  userId: number; loginId: string; name: string; email: string; address: string | null; status: 0 | 1 | 2
  createdAt: string; locked: boolean; roles: Role[]; storeIds: number[]; memberId: number | null
  pointsBalance: number | null; orderCount: number; warningCount: number
}
interface Detail {
  userId: number; loginId: string; name: string
  points: { id: number; orderId: number | null; change: number; reason: string; createdAt: string }[]
  orders: { id: number; orderTime: string; storeName: string; status: OrderStatus; totalAmount: number }[]
  warnings: { id: number; reason: string; createdAt: string; issuedBy: string | null }[]
}

const session = useSession()
const catalog = useCatalog()
const users = ref<UserRow[]>([])
const q = ref('')
const role = ref<'' | Role>('')
const error = ref('')
const toast = ref('')
const STATUS = { 0: ['正常', 'tag--blue'], 1: ['停權', 'tag--red'], 2: ['停用', ''] } as const
const REASON: Record<string, string> = { earn: '消費累積', redeem: '結帳折抵', refund: '取消退還', adjust: '人工調整' }

let t: ReturnType<typeof setTimeout> | undefined
async function load() {
  try { users.value = await http.get<UserRow[]>('/admin/users', { q: q.value, role: role.value }) } catch (e) { error.value = errorText(e) }
}
onMounted(load)
watch(q, () => { clearTimeout(t); t = setTimeout(load, 250) })
watch(role, load)
const storeName = (id: number) => catalog.stores.find((s) => s.id === id)?.name ?? `#${id}`
const counts = computed(() => ({ all: users.value.length }))

// ── create / edit ──
const form = reactive({ loginId: '', name: '', email: '', address: '', password: '', roles: ['staff'] as Role[], storeIds: [] as number[] })
const editing = ref<UserRow | null>(null)
const open = ref(false)
const formError = ref('')
function create() {
  Object.assign(form, { loginId: '', name: '', email: '', address: '', password: '', roles: ['staff'], storeIds: [] })
  editing.value = null; formError.value = ''; open.value = true
}
function edit(u: UserRow) {
  Object.assign(form, { loginId: u.loginId, name: u.name, email: u.email, address: u.address ?? '', password: '', roles: [...u.roles], storeIds: [...u.storeIds] })
  editing.value = u; formError.value = ''; open.value = true
}
const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v])
async function save() {
  formError.value = ''
  if (form.roles.includes('staff') && !form.storeIds.length) { formError.value = '店員須指派至少一間門市'; return }
  try {
    const body = { name: form.name, email: form.email, address: form.address, roles: form.roles, storeIds: form.roles.includes('staff') ? form.storeIds : [], password: form.password }
    if (editing.value) await http.put(`/admin/users/${editing.value.userId}`, body)
    else await http.post('/admin/users', { ...body, loginId: form.loginId })
    open.value = false
    flash(editing.value ? '帳號已更新' : '帳號已建立')
    await load()
    if (editing.value?.userId === session.user?.userId) await session.refresh()
  } catch (e) { formError.value = errorText(e) }
}

// ── detail: points, orders, warnings, status ──
const detail = ref<Detail | null>(null)
const detailRow = computed(() => users.value.find((u) => u.userId === detail.value?.userId))
const warnText = ref('')
async function show(u: UserRow) {
  warnText.value = ''
  try { detail.value = await http.get<Detail>(`/admin/users/${u.userId}`) } catch (e) { error.value = errorText(e) }
}
async function setStatus(u: UserRow, status: 0 | 1 | 2) {
  const verb = { 0: '恢復', 1: '停權', 2: '停用' }[status]
  if (status !== 0 && !confirm(`${verb}「${u.name}（${u.loginId}）」？此帳號將無法登入。`)) return
  try { await http.post(`/admin/users/${u.userId}/status`, { status }); flash(`已${verb}`); await load() } catch (e) { error.value = errorText(e) }
}
async function warn() {
  if (!detail.value) return
  try {
    await http.post(`/admin/users/${detail.value.userId}/warn`, { reason: warnText.value })
    warnText.value = ''
    flash('已送出警告，對方登入後會在會員資料看到')
    await Promise.all([show(detailRow.value!), load()])
  } catch (e) { error.value = errorText(e) }
}
function flash(m: string) { toast.value = m; setTimeout(() => (toast.value = ''), 2600) }
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <header class="row between" style="flex-wrap: wrap">
      <div>
        <p class="en">Accounts · {{ counts.all }}</p>
        <h1>帳號與權限</h1>
      </div>
      <button class="btn btn--primary" @click="create">建立帳號</button>
    </header>

    <div class="row" style="flex-wrap: wrap">
      <input v-model="q" class="input input--sm search" type="search" placeholder="搜尋帳號、姓名或 E-mail" aria-label="搜尋帳號" />
      <button class="chip" :aria-pressed="role === ''" @click="role = ''">全部</button>
      <button v-for="(l, r) in ROLE_LABEL" :key="r" class="chip" :aria-pressed="role === r" @click="role = r">{{ l }}</button>
    </div>
    <p v-if="error" class="notice notice--red" role="alert">{{ error }}</p>

    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>帳號</th><th>姓名</th><th>角色</th><th>門市</th><th>狀態</th><th class="num">點數</th><th class="num">訂單</th><th>建立</th><th></th></tr></thead>
        <tbody>
          <tr v-for="u in users" :key="u.userId" :class="{ 'is-muted': u.status !== 0 }">
            <td><code>{{ u.loginId }}</code></td>
            <td>{{ u.name }}<br /><span class="small muted">{{ u.email }}</span></td>
            <td><span v-for="r in u.roles" :key="r" class="tag" :class="{ 'tag--solid': r === 'admin', 'tag--blue': r === 'staff' }">{{ ROLE_LABEL[r] }}</span></td>
            <td class="small">{{ u.roles.includes('admin') ? '全部門市' : u.storeIds.map(storeName).join('、') || '—' }}</td>
            <td>
              <span class="tag" :class="STATUS[u.status][1]">{{ STATUS[u.status][0] }}</span>
              <span v-if="u.locked" class="tag tag--red">鎖定中</span>
              <span v-if="u.warningCount" class="tag tag--olive">警告 {{ u.warningCount }}</span>
            </td>
            <td class="num">{{ u.memberId ? u.pointsBalance : '—' }}</td>
            <td class="num">{{ u.memberId ? u.orderCount : '—' }}</td>
            <td class="small">{{ fmtDate(u.createdAt) }}</td>
            <td class="acts">
              <button class="linkbtn" @click="show(u)">詳細</button>
              <button class="linkbtn" @click="edit(u)">編輯</button>
              <button v-if="u.status === 0 && u.userId !== session.user?.userId" class="linkbtn linkbtn--red" @click="setStatus(u, 1)">停權</button>
              <button v-else-if="u.status !== 0" class="linkbtn" @click="setStatus(u, 0)">恢復</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <Dialog v-if="open" :title="editing ? `編輯 ${editing.loginId}` : '建立帳號'" @close="open = false">
      <form class="stack" style="--gap: 14px" novalidate @submit.prevent="save">
        <div class="form-grid">
          <div class="field"><label for="ul">登入帳號</label><input id="ul" v-model="form.loginId" class="input" :disabled="!!editing" maxlength="30" autocomplete="off" /></div>
          <div class="field"><label for="un">姓名</label><input id="un" v-model="form.name" class="input" maxlength="50" /></div>
          <div class="field"><label for="ue">E-mail</label><input id="ue" v-model="form.email" class="input" type="email" maxlength="100" /></div>
          <div class="field"><label for="up">{{ editing ? '重設密碼（留空不變）' : '初始密碼' }}</label><input id="up" v-model="form.password" class="input" type="password" autocomplete="new-password" minlength="8" /></div>
          <div class="field span-2"><label for="ua">地址（選填）</label><input id="ua" v-model="form.address" class="input" maxlength="200" /></div>
        </div>
        <fieldset class="box">
          <legend class="small muted">角色（管理員可同時是店員）</legend>
          <label v-for="(l, r) in ROLE_LABEL" :key="r" class="check"><input type="checkbox" :checked="form.roles.includes(r)" @change="form.roles = toggle(form.roles, r)" /> {{ l }}</label>
        </fieldset>
        <fieldset v-if="form.roles.includes('staff')" class="box">
          <legend class="small muted">所屬門市（店員只能處理這些門市的訂單與庫存）</legend>
          <label v-for="s in catalog.stores" :key="s.id" class="check"><input type="checkbox" :checked="form.storeIds.includes(s.id)" @change="form.storeIds = toggle(form.storeIds, s.id)" /> {{ s.name }}</label>
        </fieldset>
        <p v-if="formError" class="error" role="alert">{{ formError }}</p>
        <button class="btn btn--primary" style="justify-self: start">{{ editing ? '儲存' : '建立帳號' }}</button>
      </form>
    </Dialog>

    <Dialog v-if="detail && detailRow" :title="`${detail.name}（${detail.loginId}）`" wide @close="detail = null">
      <div class="stack" style="--gap: 22px">
        <div class="row" style="flex-wrap: wrap">
          <span class="tag" :class="STATUS[detailRow.status][1]">目前：{{ STATUS[detailRow.status][0] }}</span>
          <template v-if="detailRow.userId !== session.user?.userId">
            <button v-if="detailRow.status !== 0" class="btn btn--small" @click="setStatus(detailRow, 0)">恢復帳號</button>
            <button v-if="detailRow.status !== 1" class="btn btn--small btn--danger" @click="setStatus(detailRow, 1)">停權</button>
            <button v-if="detailRow.status !== 2" class="btn btn--small" @click="setStatus(detailRow, 2)">停用</button>
          </template>
        </div>

        <section class="stack" style="--gap: 10px">
          <h3>警告紀錄</h3>
          <p v-if="!detail.warnings.length" class="small muted">沒有警告。</p>
          <ul class="mini-list"><li v-for="w in detail.warnings" :key="w.id"><span>{{ w.reason }}</span><span class="small muted">{{ w.issuedBy }} · {{ fmtDateTime(w.createdAt) }}</span></li></ul>
          <form class="row" @submit.prevent="warn">
            <input v-model="warnText" class="input input--sm" style="flex: 1" maxlength="200" placeholder="警告原因，例如：多次下單未取" aria-label="警告原因" />
            <button class="btn btn--small" :disabled="warnText.trim().length < 2">送出警告</button>
          </form>
        </section>

        <div v-if="detailRow.memberId" class="cols">
          <section class="stack" style="--gap: 10px">
            <h3>點數紀錄 <span class="small muted">餘額 {{ detailRow.pointsBalance }}</span></h3>
            <ul class="mini-list"><li v-for="p in detail.points" :key="p.id"><span>{{ REASON[p.reason] }}<span v-if="p.orderId" class="small muted"> #{{ p.orderId }}</span></span><span :class="p.change > 0 ? 'plus' : 'minus'">{{ p.change > 0 ? '+' : '' }}{{ p.change }}</span></li></ul>
          </section>
          <section class="stack" style="--gap: 10px">
            <h3>最近訂單</h3>
            <ul class="mini-list"><li v-for="o in detail.orders" :key="o.id"><span>#{{ o.id }} {{ o.storeName }} <span class="small muted">{{ fmtDate(o.orderTime) }}</span></span><span>{{ STATUS_LABEL[o.status].zh }} · {{ money(o.totalAmount) }}</span></li></ul>
          </section>
        </div>
      </div>
    </Dialog>
    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped>
.search { width: 260px; }
code { font-size: 13px; }
.tag + .tag { margin-left: 4px; }
.acts { white-space: nowrap; text-align: right; }
.acts > * + * { margin-left: 14px; }
.box { border: 1px solid var(--line); border-radius: 4px; padding: 10px 14px 14px; margin: 0; display: flex; flex-wrap: wrap; gap: 10px 20px; }
.box legend { padding: 0 6px; }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
.mini-list { list-style: none; margin: 0; padding: 0; max-height: 260px; overflow-y: auto; }
.mini-list li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.plus { color: var(--qinghua); }
.minus { color: var(--seal); }
h3 { font-size: 16px; }
@media (max-width: 700px) { .cols { grid-template-columns: 1fr; } .search { width: 100%; } }
</style>
