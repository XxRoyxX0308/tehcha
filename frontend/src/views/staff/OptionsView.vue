<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { http, errorText } from '@/api'
import { OPTION_TYPE_LABEL } from '@/lib/format'
import { useCatalog } from '@/stores/catalog'
import type { CustomOption, OptionType } from '@/types'

// PIS-F-002: sweetness, ice and topping choices and their surcharges. Which drink offers which
// option is set on the product.
const catalog = useCatalog()
const options = ref<CustomOption[]>([])
const error = ref('')
const showDeleted = ref(false)
const types: OptionType[] = ['sweetness', 'ice', 'topping']
const drafts = reactive<Record<OptionType, { name: string; extraPrice: number }>>({
  sweetness: { name: '', extraPrice: 0 }, ice: { name: '', extraPrice: 0 }, topping: { name: '', extraPrice: 10 },
})
const editing = ref<number | null>(null)
const edit = reactive({ name: '', extraPrice: 0 })

async function load() {
  try { options.value = await http.get<CustomOption[]>('/staff/options') } catch (e) { error.value = errorText(e) }
}
onMounted(load)
const of = (t: OptionType) => options.value.filter((o) => o.type === t && (showDeleted.value || !o.isDeleted))

async function run(fn: () => Promise<unknown>) {
  error.value = ''
  try { await fn(); await Promise.all([load(), catalog.load()]) } catch (e) { error.value = errorText(e) }
}
const add = (t: OptionType) => run(async () => {
  await http.post('/staff/options', { type: t, name: drafts[t].name, extraPrice: Number(drafts[t].extraPrice) || 0 })
  drafts[t].name = ''
})
function startEdit(o: CustomOption) { editing.value = o.id; edit.name = o.name; edit.extraPrice = o.extraPrice }
const saveEdit = (o: CustomOption) => run(async () => {
  await http.put(`/staff/options/${o.id}`, { name: edit.name, extraPrice: Number(edit.extraPrice) || 0 })
  editing.value = null
})
const remove = (o: CustomOption) => confirm(`停用「${o.name}」？已使用的訂單紀錄會保留。`) && run(() => http.del(`/staff/options/${o.id}`))
const restore = (o: CustomOption) => run(() => http.post(`/staff/options/${o.id}/restore`))
const total = computed(() => options.value.filter((o) => !o.isDeleted).length)
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <header class="row between" style="flex-wrap: wrap">
      <div>
        <p class="en">Custom options · {{ total }} active</p>
        <h1>客製化選項</h1>
      </div>
      <label class="check"><input v-model="showDeleted" type="checkbox" /> 顯示已停用</label>
    </header>
    <p class="small muted">甜度與冰塊每杯必選一種，加料可複選。商品提供哪些選項，請在「商品管理」設定。</p>
    <p v-if="error" class="notice notice--red" role="alert">{{ error }}</p>

    <div class="grid">
      <section v-for="t in types" :key="t" class="panel stack" style="--gap: 12px">
        <h2>{{ OPTION_TYPE_LABEL[t] }}</h2>
        <ul class="list">
          <li v-for="o in of(t)" :key="o.id" :class="{ off: o.isDeleted }">
            <template v-if="editing === o.id">
              <form class="row edit" @submit.prevent="saveEdit(o)">
                <input v-model="edit.name" class="input input--sm" maxlength="30" aria-label="名稱" />
                <input v-model.number="edit.extraPrice" class="input input--sm price-in" type="number" min="0" aria-label="加價" />
                <button class="btn btn--small btn--primary">存</button>
                <button type="button" class="linkbtn small" @click="editing = null">取消</button>
              </form>
            </template>
            <template v-else>
              <span class="name">{{ o.name }} <span v-if="o.extraPrice" class="small muted">+NT${{ o.extraPrice }}</span></span>
              <span class="small muted">{{ o.productCount }} 項商品</span>
              <span class="acts">
                <template v-if="!o.isDeleted">
                  <button class="linkbtn small" @click="startEdit(o)">編輯</button>
                  <button class="linkbtn linkbtn--red small" @click="remove(o)">停用</button>
                </template>
                <button v-else class="linkbtn small" @click="restore(o)">恢復</button>
              </span>
            </template>
          </li>
        </ul>
        <form class="row add" @submit.prevent="add(t)">
          <input v-model="drafts[t].name" class="input input--sm" maxlength="30" :placeholder="`新${OPTION_TYPE_LABEL[t]}選項`" :aria-label="`新${OPTION_TYPE_LABEL[t]}選項名稱`" />
          <input v-model.number="drafts[t].extraPrice" class="input input--sm price-in" type="number" min="0" aria-label="加價" />
          <button class="btn btn--small" :disabled="!drafts[t].name.trim()">新增</button>
        </form>
      </section>
    </div>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; align-items: start; }
.list { list-style: none; margin: 0; padding: 0; }
.list li { display: grid; grid-template-columns: 1fr auto; gap: 2px 10px; padding: 10px 0; border-bottom: 1px solid var(--line); align-items: center; }
.list li.off .name { color: var(--tea); text-decoration: line-through; }
.list .acts { grid-column: 1 / -1; display: flex; gap: 14px; }
.edit { grid-column: 1 / -1; flex-wrap: wrap; }
.edit .input:first-child, .add .input:first-child { flex: 1; min-width: 100px; }
.price-in { width: 80px; }
.add { flex-wrap: wrap; }
@media (max-width: 1000px) { .grid { grid-template-columns: 1fr; } }
</style>
