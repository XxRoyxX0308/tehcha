<script setup lang="ts">
import { money } from '@/lib/format'
import type { AppliedDiscount } from '@/types'

// CUI-004: subtotal, tax, shipping, each discount line, points offset, total.
// Callers spread a whole Totals object in, so extra keys must not leak onto the <dl>.
defineOptions({ inheritAttrs: false })
defineProps<{
  subtotal: number; tax: number; shippingFee: number
  discounts: AppliedDiscount[]; pointsUsed: number; total: number
}>()
</script>

<template>
  <dl class="pb">
    <div><dt>小計 <span class="en">Subtotal</span></dt><dd>{{ money(subtotal) }}</dd></div>
    <div><dt>稅 5%</dt><dd>{{ money(tax) }}</dd></div>
    <div><dt>運費</dt><dd>{{ shippingFee === 0 ? '—' : money(shippingFee) }}</dd></div>
    <div v-for="d in discounts" :key="d.code" class="disc">
      <dt>{{ d.description }}</dt><dd>−{{ money(d.amount) }}</dd>
    </div>
    <div v-if="pointsUsed" class="disc"><dt>點數折抵（{{ pointsUsed }} 點）</dt><dd>−{{ money(pointsUsed) }}</dd></div>
    <div class="tot"><dt>應付總額 <span class="en">Total</span></dt><dd class="price">{{ money(total) }}</dd></div>
  </dl>
</template>

<style scoped>
.pb { margin: 0; display: grid; gap: 8px; }
.pb div { display: flex; justify-content: space-between; gap: 16px; }
.pb dt { color: var(--ink); }
.pb dd { margin: 0; font-variant-numeric: tabular-nums; }
.disc dt, .disc dd { color: var(--seal); }
.tot { border-top: 1px solid var(--line); padding-top: 12px; margin-top: 4px; align-items: baseline; }
.tot dd { font-size: 26px; color: var(--qinghua); }
</style>
