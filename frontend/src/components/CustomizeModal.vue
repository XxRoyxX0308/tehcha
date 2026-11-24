<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { http, errorText } from '@/api'
import CupArt from './CupArt.vue'
import { useCatalog } from '@/stores/catalog'
import { useCart } from '@/stores/cart'
import { validateQuantity } from '@/lib/pricing'
import { money } from '@/lib/format'
import { useModal } from '@/lib/useModal'
import { useMedia } from '@/lib/useMedia'
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

const box = ref<HTMLElement | null>(null)
const { backdrop } = useModal(box, () => emit('close'))

// Phones: the sheet follows a downward drag from its top and closes past 110px (or on a quick flick).
const phone = useMedia('(max-width: 600px)')
const drag = ref(0)
let startY = 0
let startT = 0
let dragging = false
function onTouchStart(e: TouchEvent) {
  if (!phone.value || (box.value?.scrollTop ?? 0) > 0) return
  dragging = true
  startY = e.touches[0].clientY
  startT = performance.now()
}
function onTouchMove(e: TouchEvent) {
  if (!dragging) return
  const dy = e.touches[0].clientY - startY
  if (dy <= 0) { drag.value = 0; return } // moving up: let the sheet scroll normally
  if (e.cancelable) e.preventDefault()
  drag.value = dy
}
function onTouchEnd() {
  if (!dragging) return
  dragging = false
  const fast = drag.value > 40 && drag.value / (performance.now() - startT) > 0.6
  if (drag.value > 110 || fast) emit('close')
  else drag.value = 0
}
</script>

<template>
  <Teleport to="body">
  <div class="ov" :style="drag ? { '--fade': String(Math.max(0, 1 - drag / 400)) } : undefined" v-bind="backdrop">
    <section
      ref="box" class="md card" :class="{ dragging: drag > 0 }" role="dialog" aria-modal="true" :aria-label="product.name + ' 客製化'" tabindex="-1"
      :style="drag ? { transform: `translateY(${drag}px)` } : undefined"
      @touchstart.passive="onTouchStart" @touchmove="onTouchMove" @touchend="onTouchEnd" @touchcancel="onTouchEnd"
    >
      <button class="md__x" aria-label="關閉" @click="emit('close')"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 3.5l9 9M12.5 3.5l-9 9" /></svg></button>

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
  </Teleport>
</template>

<style scoped>
.ov {
  position: fixed; inset: 0; z-index: 50; display: grid; place-items: center; padding: 16px;
  background: rgba(43, 33, 24, calc(0.5 * var(--fade, 1)));
  animation: fade-in 0.2s ease-out;
}
.md {
  position: relative; width: min(520px, 100%); padding: 28px; background: var(--paper);
  max-height: calc(100vh - 32px); max-height: calc(100dvh - 32px); overflow-y: auto; overscroll-behavior: contain;
  animation: rise-in 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.md:focus { outline: none; }
.md__x {
  position: absolute; top: 10px; right: 10px; z-index: 1; width: 40px; height: 40px; display: grid; place-items: center;
  background: none; border: 0; border-radius: 50%; cursor: pointer; color: var(--tea); transition: background 0.15s, color 0.15s;
}
.md__x:hover { background: var(--paper-deep); color: var(--qinghua); }
.md__x svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; }
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
    animation: sheet-up 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
    transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  }
  .md.dragging { transition: none; }
  .md::before {
    content: ''; display: block; width: 40px; height: 4px; margin: 0 auto 14px;
    background: var(--line); border-radius: 2px;
  }
  .md__x { top: 6px; right: 8px; }
  .md__art { width: 64px; height: 100px; }
  .md__head h2 { font-size: 22px; }
  .md__foot {
    position: sticky; bottom: 0; margin: 20px -20px 0; padding: 12px 20px calc(12px + env(safe-area-inset-bottom));
    background: var(--paper);
  }
  .add { margin-top: 12px; }
}
</style>
