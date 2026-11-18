<script setup lang="ts">
import { computed } from 'vue'
import CupArt from './CupArt.vue'
import Seal from './Seal.vue'
import { useCatalog } from '@/stores/catalog'
import { money, todayStr } from '@/lib/format'
import type { Product } from '@/types'

// variant "card": the paper-label card. On phones (≤600px) it reflows into a compact row
//                  with the cup on the left, so the full menu isn't one 8000px column.
// variant "tile": small tappable tile for the horizontal "popular / your usual" rails on phones.
const props = withDefaults(defineProps<{ product: Product; variant?: 'card' | 'tile' }>(), { variant: 'card' })
const emit = defineEmits<{ pick: [Product] }>()

const catalog = useCatalog()
const stock = computed(() => catalog.stockOf(props.product.id))
const soldOut = computed(() => stock.value <= 0)
const special = computed(() => catalog.specialFor(props.product.id, todayStr()))
const category = computed(() => catalog.categoryById(props.product.categoryId))
const wash = computed(() => `color-mix(in srgb, ${props.product.tint} 14%, var(--paper))`)
const badge = computed(() =>
  soldOut.value ? { text: '已售完', cls: 'out' }
  : stock.value <= 5 ? { text: `僅剩 ${stock.value} 杯`, cls: 'low' }
  : special.value ? { text: special.value.ruleType === 'buy1get1' ? '買一送一' : '限時優惠', cls: '' }
  : null,
)
const pick = () => { if (!soldOut.value) emit('pick', props.product) }
</script>

<template>
  <button v-if="variant === 'tile'" class="tile card" :class="{ 'is-out': soldOut }" :disabled="soldOut" @click="pick">
    <span class="tile__art" :style="{ background: wash }">
      <CupArt :tint="product.tint" :topping="product.topping" :id="product.id" />
      <span v-if="badge" class="badge" :class="badge.cls">{{ badge.text }}</span>
    </span>
    <span class="tile__name">{{ product.name }}</span>
    <span class="price">{{ money(product.price) }}</span>
  </button>

  <article v-else class="pc card" :class="{ 'is-out': soldOut }">
    <header class="pc__top">
      <span class="en">{{ category?.nameEn }}</span>
      <Seal :size="26" />
    </header>
    <h3 class="pc__name">{{ product.name }}</h3>
    <p class="pc__en">{{ product.nameEn }}</p>
    <hr class="rule pc__rule" />
    <p class="pc__tag">{{ product.tagline }}</p>

    <div class="pc__art" :style="{ background: wash }" @click="pick">
      <CupArt :tint="product.tint" :topping="product.topping" :id="product.id" />
      <span v-if="badge" class="badge" :class="badge.cls">{{ badge.text }}</span>
    </div>

    <footer class="pc__foot">
      <span class="price">{{ money(product.price) }}</span>
      <button class="btn btn--small" :disabled="soldOut" @click="pick">
        {{ soldOut ? '本店無貨' : '選規格' }}
      </button>
    </footer>
  </article>
</template>

<style scoped>
.badge {
  position: absolute; top: 8px; left: 8px; padding: 2px 10px; font-size: 12px; white-space: nowrap;
  background: var(--qinghua); color: var(--paper); border-radius: 999px;
}
.badge.low { background: var(--tea); }
.badge.out { background: var(--seal); }
.is-out :deep(svg) { opacity: 0.4; filter: grayscale(0.6); }

/* ── card (desktop / tablet) ── */
.pc {
  padding: 18px 18px 16px; display: grid; grid-template-columns: 1fr;
  grid-template-areas: 'top' 'name' 'en' 'rule' 'tag' 'art' 'foot';
}
.pc__top { grid-area: top; display: flex; justify-content: space-between; align-items: center; }
.pc__name { grid-area: name; margin-top: 14px; }
.pc__en { grid-area: en; font-family: var(--serif); font-size: 14px; color: var(--tea); }
.pc__rule { grid-area: rule; }
.pc__tag { grid-area: tag; color: var(--ink); font-size: 15px; letter-spacing: 0.04em; }
.pc__art { grid-area: art; position: relative; margin: 14px 0; height: 190px; display: grid; place-items: center; border-radius: 2px; cursor: pointer; }
.pc__art :deep(svg) { height: 168px; }
.pc__foot { grid-area: foot; display: flex; justify-content: space-between; align-items: center; }
.pc__foot .price { font-size: 20px; }

/* ── card on phones: compact row ── */
@media (max-width: 600px) {
  .pc {
    padding: 12px; column-gap: 14px; align-items: start;
    grid-template-columns: 92px 1fr;
    grid-template-areas: 'art top' 'art name' 'art en' 'art tag' 'art foot';
  }
  .pc__top .en { font-size: 11px; }
  .pc__top :deep(.seal-svg) { display: none; }
  .pc__name { margin-top: 2px; font-size: 17px; }
  .pc__en { font-size: 12px; }
  .pc__rule { display: none; }
  .pc__tag { font-size: 13px; color: var(--tea); margin-top: 4px; }
  .pc__art { margin: 0; height: 128px; align-self: stretch; }
  .pc__art :deep(svg) { height: 112px; }
  .pc__art .badge { top: auto; bottom: 6px; left: 50%; transform: translateX(-50%); font-size: 11px; padding: 1px 8px; }
  .pc__foot { margin-top: 8px; }
  .pc__foot .price { font-size: 18px; }
}

/* ── tile (phone rails) ── */
.tile {
  display: grid; gap: 4px; padding: 8px 8px 12px; width: 100%; text-align: left;
  font: inherit; color: inherit; cursor: pointer;
}
.tile:disabled { cursor: not-allowed; }
.tile__art { position: relative; display: grid; place-items: center; height: 132px; border-radius: 2px; }
.tile__art :deep(svg) { height: 116px; }
.tile__art .badge { top: auto; bottom: 6px; left: 50%; transform: translateX(-50%); font-size: 11px; padding: 1px 8px; }
.tile__name { font-family: var(--serif); font-weight: 700; color: var(--qinghua); font-size: 15px; margin-top: 4px; }
.tile .price { font-size: 15px; }
</style>
