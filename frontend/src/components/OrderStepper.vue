<script setup lang="ts">
import { computed } from 'vue'
import { STATUS_FLOW } from '@/lib/pricing'
import { STATUS_LABEL } from '@/lib/format'
import type { Fulfillment, OrderStatus } from '@/types'

// CUI-005 / OCS-F-003: the four fixed stages, in order.
const props = defineProps<{ status: OrderStatus; fulfillment: Fulfillment }>()
const idx = computed(() => STATUS_FLOW.indexOf(props.status))
const label = (s: OrderStatus) =>
  s === 'shipping' ? (props.fulfillment === 'pickup' ? { zh: '待取餐', en: 'Ready' } : { zh: '配送中', en: 'On the way' }) : STATUS_LABEL[s]
</script>

<template>
  <ol class="st" aria-label="訂單進度">
    <li v-for="(s, i) in STATUS_FLOW" :key="s" :class="{ done: i < idx, now: i === idx }" :aria-current="i === idx ? 'step' : undefined">
      <span class="dot">{{ i < idx ? '✓' : i + 1 }}</span>
      <span class="zh">{{ label(s).zh }}</span>
      <span class="en">{{ label(s).en }}</span>
    </li>
  </ol>
</template>

<style scoped>
.st { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); }
.st li { position: relative; display: grid; justify-items: center; gap: 4px; text-align: center; color: var(--tea); }
.st li::before { content: ''; position: absolute; top: 17px; right: 50%; width: 100%; height: 1px; background: var(--line); z-index: 0; }
.st li:first-child::before { display: none; }
.st li.done::before, .st li.now::before { background: var(--qinghua); }
.dot {
  position: relative; z-index: 1; display: grid; place-items: center; width: 35px; height: 35px; border-radius: 50%;
  background: var(--paper); border: 1px solid var(--line); font-family: var(--serif);
}
.done .dot { background: var(--qinghua); border-color: var(--qinghua); color: var(--paper); }
.now .dot { border-color: var(--qinghua); color: var(--qinghua); box-shadow: 0 0 0 4px var(--qinghua-wash); font-weight: 700; }
.now .zh { color: var(--qinghua); font-weight: 700; }
.done .zh { color: var(--ink); }
.zh { font-size: 14px; }
.en { font-size: 11px; }
</style>
