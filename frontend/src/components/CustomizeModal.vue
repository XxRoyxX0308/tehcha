<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { http, errorText } from '@/api'
import CupArt from './CupArt.vue'
import { useCatalog } from '@/stores/catalog'
import { useCart } from '@/stores/cart'
import { validateQuantity } from '@/lib/pricing'
import { money } from '@/lib/format'
import type { Product } from '@/types'

// CUI-003: sweetness / ice are single-choice and required, toppings are optional extras.
const props = defineProps<{ product: Product }>()
const emit = defineEmits<{ close: []; added: []; pick: [Product] }>()

const catalog = useCatalog()
const cart = useCart()

const opts = computed(() => props.product.optionIds.map((id) => catalog.optionById(id)!).filter(Boolean))
const sweet = computed(() => opts.value.filter((o) => o.type === 'sweetness'))
const ice = computed(() => opts.value.filter((o) => o.type === 'ice'))
const tops = computed(() => opts.value.filter((o) => o.type === 'topping'))

const sweetId = ref(sweet.value.find((o) => o.name === '半糖')?.id ?? sweet.value[0]?.id)
const iceId = ref(ice.value.find((o) => o.name === '少冰')?.id ?? ice.value[0]?.id)
const toppingIds = ref<number[]>([])
const qty = ref(1)

const stock = computed(() => catalog.stockOf(props.product.id))
// Cups of this product already in the cart count against stock too.
const inCart = computed(() => cart.inCart(props.product.id))
const available = computed(() => Math.max(0, stock.value - inCart.value))
const qtyError = computed(() => validateQuantity(qty.value, available.value))

const selected = computed(() => [sweetId.value, iceId.value, ...toppingIds.value].filter((x): x is number => !!x))
const unit = computed(() => props.product.price + cart.extraOf(selected.value))

function toggleTopping(id: number) {
  toppingIds.value = toppingIds.value.includes(id) ? toppingIds.value.filter((x) => x !== id) : [...toppingIds.value, id]
}
function step(d: number) {
  qty.value = Math.max(1, Math.min(Math.max(1, available.value), qty.value + d))
}
const busy = ref(false)
const addError = ref('')
async function add() {
  if (qtyError.value || busy.value) return
  busy.value = true
  addError.value = ''
  try {
    await cart.add(props.product.id, selected.value, qty.value)
    emit('added')
    emit('close')
  } catch (e) {
    addError.value = errorText(e, '加入失敗，請再試一次')
    void catalog.refreshStock()
  } finally {
    busy.value = false
  }
}

// SRMS-F-005: what people who bought this drink also bought
const also = ref<Product[]>([])
onMounted(async () => {
  try {
    const r = await http.get<{ productId: number }[]>(`/products/${props.product.id}/also-bought`)
    also.value = r.map((x) => catalog.productById(x.productId)).filter((p): p is Product => !!p && catalog.stockOf(p.id) > 0).slice(0, 3)
  } catch { /* optional */ }
})

const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
onMounted(() => { window.addEventListener('keydown', onKey); document.body.style.overflow = 'hidden' })
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); document.body.style.overflow = '' })
</script>

<template>
  <div class="ov" @click.self="emit('close')">
    <section class="md card" role="dialog" aria-modal="true" :aria-label="product.name + ' 客製化'">
      <button class="md__x" aria-label="關閉" @click="emit('close')">✕</button>

      <div class="md__head">
        <div class="md__art"><img v-if="product.imageUrl" :src="product.imageUrl" :alt="product.name" /><CupArt v-else :tint="product.tint" :topping="product.topping" :id="product.id" /></div>
        <div>
          <p class="en">{{ product.nameEn }}</p>
          <h2>{{ product.name }}</h2>
          <p class="muted small" style="margin-top:6px">{{ product.description }}</p>
        </div>
      </div>
      <hr class="rule" />

      <div class="grp">
        <h3>甜度 <span class="en">Sweetness</span></h3>
        <div class="chips">
          <button v-for="o in sweet" :key="o.id" class="chip" :aria-pressed="sweetId === o.id" @click="sweetId = o.id">{{ o.name }}</button>
        </div>
      </div>
      <div class="grp">
        <h3>冰塊 <span class="en">Ice</span></h3>
        <div class="chips">
          <button v-for="o in ice" :key="o.id" class="chip" :aria-pressed="iceId === o.id" @click="iceId = o.id">{{ o.name }}</button>
        </div>
      </div>
      <div v-if="tops.length" class="grp">
        <h3>加料 <span class="en">Toppings</span></h3>
        <div class="chips">
          <button v-for="o in tops" :key="o.id" class="chip" :aria-pressed="toppingIds.includes(o.id)" @click="toggleTopping(o.id)">
            {{ o.name }} <span class="plus">+{{ o.extraPrice }}</span>
          </button>
        </div>
      </div>

      <div v-if="also.length" class="grp also">
        <h3>買過的人也買了 <span class="en">Also bought</span></h3>
        <div class="chips">
          <button v-for="p in also" :key="p.id" class="chip" @click="emit('pick', p)">{{ p.name }}</button>
        </div>
      </div>

      <div class="md__foot">
        <div class="row between">
          <div class="step" role="group" aria-label="數量">
            <button class="chip" :disabled="qty <= 1" aria-label="減少" @click="step(-1)">−</button>
            <output>{{ qty }}</output>
            <button class="chip" :disabled="qty >= available" aria-label="增加" @click="step(1)">＋</button>
          </div>
          <p class="price" style="font-size:22px">{{ money(unit * qty) }}</p>
        </div>
        <p v-if="qtyError || addError" class="error" style="margin-top:8px" role="alert">{{ addError || qtyError }}</p>
        <button class="btn btn--primary add" :disabled="!!qtyError || busy" @click="add">{{ busy ? '加入中…' : '加入購物車' }}</button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.ov { position: fixed; inset: 0; z-index: 50; background: rgba(43, 33, 24, 0.5); display: grid; place-items: center; padding: 16px; overflow-y: auto; }
.md { position: relative; width: min(520px, 100%); padding: 28px; background: var(--paper); max-height: calc(100vh - 32px); overflow-y: auto; }
.md__x { position: absolute; top: 12px; right: 14px; background: none; border: 0; font-size: 18px; cursor: pointer; color: var(--tea); }
.md__head { display: flex; gap: 20px; align-items: center; }
.md__art { flex: none; width: 84px; height: 130px; }
.md__art svg, .md__art img { width: 100%; height: 100%; object-fit: cover; border-radius: 2px; }
.also { padding-top: 14px; border-top: 1px dashed var(--line); }
.grp { margin-top: 16px; }
.grp h3 { font-size: 16px; margin-bottom: 8px; }
.grp .en { margin-left: 6px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }
.plus { margin-left: 6px; opacity: 0.7; font-size: 13px; }
.step { display: flex; align-items: center; gap: 14px; }
.step output { min-width: 28px; text-align: center; font-family: var(--serif); font-size: 20px; }
.step .chip { padding: 0; width: 38px; justify-content: center; }
.step .chip:disabled { opacity: 0.4; cursor: not-allowed; }
.add { width: 100%; margin-top: 18px; }
.md__foot { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--line); }

/* Phones: bottom sheet with the quantity / add bar pinned to the bottom */
@media (max-width: 600px) {
  .ov { place-items: end stretch; padding: 0; }
  .md {
    width: 100%; max-height: 92dvh; padding: 8px 20px 0;
    border-radius: 16px 16px 0 0; border-bottom: 0;
    animation: up 0.22s ease-out;
  }
  .md::before {
    content: ''; display: block; width: 40px; height: 4px; margin: 0 auto 14px;
    background: var(--line); border-radius: 2px;
  }
  .md__x { top: 14px; }
  .md__art { width: 64px; height: 100px; }
  .md__head h2 { font-size: 22px; }
  .md__foot {
    position: sticky; bottom: 0; margin: 20px -20px 0; padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
    background: var(--paper);
  }
  .add { margin-top: 12px; }
}
@keyframes up { from { transform: translateY(40px); opacity: 0; } to { transform: none; opacity: 1; } }
</style>
