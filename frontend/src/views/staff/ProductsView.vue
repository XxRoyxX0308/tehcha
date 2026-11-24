<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import CupArt from '@/components/CupArt.vue'
import Dialog from '@/components/console/Dialog.vue'
import { http, errorText } from '@/api'
import { money, OPTION_TYPE_LABEL } from '@/lib/format'
import { useCatalog } from '@/stores/catalog'
import type { Category, CustomOption, Product, Topping } from '@/types'

// SUI-002 / PIS-F-001, PIS-F-002: products and the options each one offers. Delete is a soft delete.
const catalog = useCatalog()
const products = ref<Product[]>([])
const categories = ref<Category[]>([])
const options = ref<CustomOption[]>([])
const q = ref('')
const cat = ref(0)
const showDeleted = ref(false)
const error = ref('')
const toast = ref('')

async function load() {
  try {
    ;[products.value, categories.value, options.value] = await Promise.all([
      http.get<Product[]>('/staff/products'), http.get<Category[]>('/staff/categories'), http.get<CustomOption[]>('/staff/options'),
    ])
  } catch (e) { error.value = errorText(e) }
}
onMounted(load)

const list = computed(() => {
  const k = q.value.trim().toLowerCase()
  return products.value.filter((p) =>
    (showDeleted.value || !p.isDeleted) && (!cat.value || p.categoryId === cat.value) &&
    (!k || `${p.name} ${p.nameEn ?? ''} ${p.id}`.toLowerCase().includes(k)))
})
const catName = (id: number) => categories.value.find((c) => c.id === id)?.name ?? '—'
const liveOptions = computed(() => options.value.filter((o) => !o.isDeleted))
const optionGroups = computed(() => (['sweetness', 'ice', 'topping'] as const).map((t) => ({ type: t, label: OPTION_TYPE_LABEL[t], items: liveOptions.value.filter((o) => o.type === t) })))

// ── form ──
const blank = () => ({
  categoryId: categories.value[0]?.id ?? 0, name: '', nameEn: '', tagline: '', description: '', imageUrl: '',
  price: 50, tint: '#B98C62', topping: 'none' as Topping,
  optionIds: liveOptions.value.filter((o) => o.type !== 'topping').map((o) => o.id),
})
const form = reactive(blank())
const editing = ref<Product | null>(null)
const open = ref(false)
const saving = ref(false)
const formError = ref('')

function create() { Object.assign(form, blank()); editing.value = null; formError.value = ''; open.value = true }
function edit(p: Product) {
  Object.assign(form, {
    categoryId: p.categoryId, name: p.name, nameEn: p.nameEn ?? '', tagline: p.tagline ?? '', description: p.description ?? '',
    imageUrl: p.imageUrl ?? '', price: p.price, tint: p.tint, topping: p.topping, optionIds: [...p.optionIds],
  })
  editing.value = p
  formError.value = ''
  open.value = true
}
function toggle(id: number) {
  form.optionIds = form.optionIds.includes(id) ? form.optionIds.filter((x) => x !== id) : [...form.optionIds, id]
}

async function save() {
  formError.value = ''
  if (!form.name.trim()) { formError.value = '請填寫商品名稱'; return }
  if (!(form.price >= 0)) { formError.value = '價格不可為負數'; return }
  saving.value = true
  try {
    const body = { ...form, price: Number(form.price) }
    if (editing.value) await http.put(`/staff/products/${editing.value.id}`, body)
    else await http.post('/staff/products', body)
    open.value = false
    flash(editing.value ? '商品已更新' : '商品已新增，請到「門市與庫存」補上庫存')
    await Promise.all([load(), catalog.load()])
  } catch (e) {
    formError.value = errorText(e)
  } finally {
    saving.value = false
  }
}

async function remove(p: Product) {
  if (!confirm(`下架「${p.name}」？過去的訂單會保留這項商品。`)) return
  try { await http.del(`/staff/products/${p.id}`); flash('已下架'); await Promise.all([load(), catalog.load()]) } catch (e) { error.value = errorText(e) }
}
async function restore(p: Product) {
  try { await http.post(`/staff/products/${p.id}/restore`); flash('已重新上架'); await Promise.all([load(), catalog.load()]) } catch (e) { error.value = errorText(e) }
}

// ── categories ──
const newCat = reactive({ name: '', nameEn: '' })
const catOpen = ref(false)
async function addCategory() {
  try {
    await http.post('/staff/categories', newCat)
    newCat.name = ''; newCat.nameEn = ''
    await load()
  } catch (e) { formError.value = errorText(e) }
}

function flash(m: string) { toast.value = m; setTimeout(() => (toast.value = ''), 2400) }
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <header class="row between" style="flex-wrap: wrap">
      <div>
        <p class="en">Products</p>
        <h1>商品管理</h1>
      </div>
      <div class="row">
        <button class="btn" @click="catOpen = true; formError = ''">分類</button>
        <button class="btn btn--primary" @click="create">新增商品</button>
      </div>
    </header>

    <div class="row filters">
      <input v-model="q" class="input input--sm" type="search" placeholder="搜尋名稱或編號" aria-label="搜尋商品" />
      <select v-model.number="cat" class="input input--sm" aria-label="分類">
        <option :value="0">全部分類</option>
        <option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <label class="check"><input v-model="showDeleted" type="checkbox" /> 顯示已下架</label>
    </div>

    <p v-if="error" class="notice notice--red" role="alert">{{ error }}</p>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr><th>編號</th><th></th><th>商品</th><th>分類</th><th class="num">價格</th><th>客製化選項</th><th>狀態</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="p in list" :key="p.id" :class="{ 'is-muted': p.isDeleted }">
            <td class="num">{{ p.id }}</td>
            <td class="thumb"><img v-if="p.imageUrl" :src="p.imageUrl" alt="" /><CupArt v-else :tint="p.tint" :topping="p.topping" :id="p.id" /></td>
            <td><strong>{{ p.name }}</strong><br /><span class="small muted">{{ p.nameEn }}</span></td>
            <td>{{ catName(p.categoryId) }}</td>
            <td class="num">{{ money(p.price) }}</td>
            <td class="small">{{ p.optionIds.length }} 項<span v-if="p.optionIds.some((id) => options.find((o) => o.id === id)?.type === 'topping')" class="muted">（含加料）</span></td>
            <td><span class="tag" :class="p.isDeleted ? 'tag--red' : 'tag--blue'">{{ p.isDeleted ? '已下架' : '販售中' }}</span></td>
            <td class="acts">
              <button class="linkbtn" @click="edit(p)">編輯</button>
              <button v-if="!p.isDeleted" class="linkbtn linkbtn--red" @click="remove(p)">下架</button>
              <button v-else class="linkbtn" @click="restore(p)">重新上架</button>
            </td>
          </tr>
          <tr v-if="!list.length"><td colspan="8" class="muted">沒有符合的商品</td></tr>
        </tbody>
      </table>
    </div>

    <Dialog v-if="open" :title="editing ? `編輯 #${editing.id} ${editing.name}` : '新增商品'" wide @close="open = false">
      <form class="pf" novalidate @submit.prevent="save">
        <div class="form-grid">
          <div class="field"><label for="pn">商品名稱</label><input id="pn" v-model="form.name" class="input" maxlength="50" required /></div>
          <div class="field"><label for="pe">英文名稱</label><input id="pe" v-model="form.nameEn" class="input" maxlength="60" /></div>
          <div class="field"><label for="pc">分類</label>
            <select id="pc" v-model.number="form.categoryId" class="input"><option v-for="c in categories" :key="c.id" :value="c.id">{{ c.name }}</option></select>
          </div>
          <div class="field"><label for="pp">價格（NT$）</label><input id="pp" v-model.number="form.price" class="input" type="number" min="0" step="1" /></div>
          <div class="field span-2"><label for="pt">一句話介紹</label><input id="pt" v-model="form.tagline" class="input" maxlength="60" /></div>
          <div class="field span-2"><label for="pd">描述</label><textarea id="pd" v-model="form.description" class="input" maxlength="2000"></textarea></div>
          <div class="field span-2"><label for="pi">圖片網址（選填，留空則顯示插畫杯）</label><input id="pi" v-model="form.imageUrl" class="input" placeholder="https://…" /></div>
          <div class="field"><label for="pk">插畫茶色</label><input id="pk" v-model="form.tint" class="input color" type="color" /></div>
          <div class="field"><label for="pa">插畫配料</label>
            <select id="pa" v-model="form.topping" class="input">
              <option value="none">無</option><option value="pearl">珍珠</option><option value="jelly">仙草凍</option><option value="foam">奶蓋</option>
            </select>
          </div>
        </div>

        <fieldset v-for="g in optionGroups" :key="g.type" class="opts">
          <legend>{{ g.label }}</legend>
          <label v-for="o in g.items" :key="o.id" class="check">
            <input type="checkbox" :checked="form.optionIds.includes(o.id)" @change="toggle(o.id)" />
            {{ o.name }}<span v-if="o.extraPrice" class="small muted">+{{ o.extraPrice }}</span>
          </label>
        </fieldset>

        <div class="preview" aria-hidden="true">
          <img v-if="form.imageUrl" :src="form.imageUrl" alt="" />
          <CupArt v-else :tint="form.tint" :topping="form.topping" :id="999" />
        </div>

        <p v-if="formError" class="error" role="alert">{{ formError }}</p>
        <div class="row">
          <button class="btn btn--primary" :disabled="saving">{{ saving ? '儲存中…' : '儲存商品' }}</button>
          <button type="button" class="btn btn--ghost" @click="open = false">取消</button>
        </div>
      </form>
    </Dialog>

    <Dialog v-if="catOpen" title="商品分類" @close="catOpen = false">
      <ul class="cats">
        <li v-for="c in categories" :key="c.id" class="row between"><span>{{ c.name }} <span class="small muted">{{ c.nameEn }}</span></span><span class="small muted">{{ c.productCount }} 項商品</span></li>
      </ul>
      <form class="row cat-add" @submit.prevent="addCategory">
        <input v-model="newCat.name" class="input input--sm" placeholder="新分類名稱" maxlength="30" aria-label="新分類名稱" />
        <input v-model="newCat.nameEn" class="input input--sm" placeholder="English" maxlength="40" aria-label="英文名稱" />
        <button class="btn btn--small btn--primary" :disabled="!newCat.name.trim()">新增</button>
      </form>
      <p v-if="formError" class="error">{{ formError }}</p>
    </Dialog>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>
  </div>
</template>

<style scoped>
.filters { flex-wrap: wrap; }
.filters .input { width: auto; min-width: 180px; }
.thumb { width: 56px; padding-block: 4px; }
.thumb :deep(svg), .thumb img { height: 52px; width: auto; display: block; }
.acts { white-space: nowrap; text-align: right; }
.acts > * + * { margin-left: 14px; }
.pf { display: grid; gap: 18px; grid-template-columns: 1fr 150px; }
.pf > .form-grid, .pf > .opts, .pf > .error, .pf > .row { grid-column: 1; }
.preview { grid-column: 2; grid-row: 1 / span 2; align-self: start; height: 200px; display: grid; place-items: center; background: var(--paper-deep); border: 1px solid var(--line); border-radius: 4px; }
.preview :deep(svg), .preview img { height: 180px; max-width: 100%; object-fit: cover; }
.opts { border: 1px solid var(--line); border-radius: 4px; padding: 10px 14px 14px; display: flex; flex-wrap: wrap; gap: 10px 18px; margin: 0; }
.opts legend { padding: 0 6px; color: var(--tea); font-size: 14px; }
.color { padding: 4px; height: 46px; }
.cats { list-style: none; margin: 0 0 16px; padding: 0; }
.cats li { padding: 10px 0; border-bottom: 1px solid var(--line); }
.cat-add { flex-wrap: wrap; }
.cat-add .input { flex: 1; min-width: 120px; }
@media (max-width: 700px) { .pf { grid-template-columns: 1fr; } .preview { display: none; } }
</style>
