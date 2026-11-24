<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

// Single-series bar chart: one ink, thin bars with 4px rounded ends on the baseline, a 2px gap,
// recessive grid, and a tooltip per bar (wider hit area than the bar). The title names the series,
// so there is no legend; the page shows the same numbers as a table.
const props = withDefaults(defineProps<{
  data: { label: string; value: number; detail?: string }[]
  format?: (v: number) => string
  height?: number
  horizontal?: boolean
  label: string // accessible name
}>(), { format: (v: number) => v.toLocaleString('en-US'), height: 220, horizontal: false })

const hover = ref<number | null>(null)
// the SVG is drawn at its real pixel width so text stays 11-12px at any size
const el = ref<HTMLElement | null>(null)
const width = ref(640)
let ro: ResizeObserver | undefined
onMounted(() => {
  ro = new ResizeObserver(([e]) => { width.value = Math.max(280, Math.round(e.contentRect.width)) })
  if (el.value) ro.observe(el.value)
})
onBeforeUnmount(() => ro?.disconnect())
const PAD = { l: 52, r: 8, t: 12, b: 26 }

const max = computed(() => {
  const m = Math.max(1, ...props.data.map((d) => d.value))
  const step = 10 ** Math.floor(Math.log10(m))
  return Math.ceil(m / step) * step
})
const ticks = computed(() => [0, 0.25, 0.5, 0.75, 1].map((f) => f * max.value))

// vertical
const plotH = computed(() => props.height - PAD.t - PAD.b)
const slot = computed(() => (width.value - PAD.l - PAD.r) / Math.max(1, props.data.length))
const barW = computed(() => Math.max(2, Math.min(36, slot.value - 2)))
const y = (v: number) => PAD.t + plotH.value - (v / max.value) * plotH.value
const labelEvery = computed(() => Math.ceil(props.data.length / Math.max(4, Math.floor(width.value / 70))))

// horizontal
const rowH = 30
const hLabelW = 92
const hHeight = computed(() => props.data.length * rowH + 8)
const hx = (v: number) => (v / max.value) * (width.value - hLabelW - 70)

/** Bar path with 4px rounded data end and a square base. */
function vbar(x: number, top: number, w: number, base: number) {
  const r = Math.min(4, w / 2, Math.max(0, base - top))
  return `M${x},${base}V${top + r}Q${x},${top} ${x + r},${top}H${x + w - r}Q${x + w},${top} ${x + w},${top + r}V${base}Z`
}
function hbar(x0: number, yTop: number, len: number, h: number) {
  const r = Math.min(4, h / 2, len)
  return `M${x0},${yTop}H${x0 + len - r}Q${x0 + len},${yTop} ${x0 + len},${yTop + r}V${yTop + h - r}Q${x0 + len},${yTop + h} ${x0 + len - r},${yTop + h}H${x0}Z`
}

const tip = computed(() => {
  if (hover.value === null) return null
  const d = props.data[hover.value]
  if (!d) return null
  const pctX = props.horizontal ? Math.min(85, ((hLabelW + hx(d.value)) / width.value) * 100) : ((PAD.l + slot.value * (hover.value + 0.5)) / width.value) * 100
  const pctY = props.horizontal ? ((hover.value * rowH) / hHeight.value) * 100 : (y(d.value) / props.height) * 100
  return { d, left: `${pctX}%`, top: `${pctY}%` }
})
</script>

<template>
  <figure ref="el" class="bc" @mouseleave="hover = null">
    <svg v-if="!horizontal" :viewBox="`0 0 ${width} ${height}`" role="img" :aria-label="label">
      <g class="grid">
        <g v-for="t in ticks" :key="t">
          <line :x1="PAD.l" :x2="width - PAD.r" :y1="y(t)" :y2="y(t)" :class="{ base: t === 0 }" />
          <text :x="PAD.l - 8" :y="y(t) + 4" text-anchor="end">{{ format(t) }}</text>
        </g>
      </g>
      <g v-for="(d, i) in data" :key="d.label">
        <path :d="vbar(PAD.l + slot * i + (slot - barW) / 2, y(d.value), barW, y(0))" class="bar" :class="{ dim: hover !== null && hover !== i }" />
        <text v-if="i % labelEvery === 0" class="xl" :x="PAD.l + slot * (i + 0.5)" :y="height - 8" text-anchor="middle">{{ d.label }}</text>
        <rect class="hit" :x="PAD.l + slot * i" :y="PAD.t" :width="slot" :height="plotH" @mouseenter="hover = i" @click="hover = i" />
      </g>
    </svg>

    <svg v-else :viewBox="`0 0 ${width} ${hHeight}`" role="img" :aria-label="label">
      <g v-for="(d, i) in data" :key="d.label">
        <text class="yl" :x="hLabelW - 10" :y="i * rowH + rowH / 2 + 4" text-anchor="end">{{ d.label }}</text>
        <path :d="hbar(hLabelW, i * rowH + 6, Math.max(2, hx(d.value)), rowH - 12)" class="bar" :class="{ dim: hover !== null && hover !== i }" />
        <text class="val" :x="hLabelW + Math.max(2, hx(d.value)) + 8" :y="i * rowH + rowH / 2 + 4">{{ format(d.value) }}</text>
        <rect class="hit" x="0" :y="i * rowH" :width="width" :height="rowH" @mouseenter="hover = i" @click="hover = i" />
      </g>
    </svg>

    <div v-if="tip" class="tip" :style="{ left: tip.left, top: tip.top }" role="status">
      <strong>{{ tip.d.label }}</strong>
      <span>{{ format(tip.d.value) }}</span>
      <span v-if="tip.d.detail" class="muted">{{ tip.d.detail }}</span>
    </div>
  </figure>
</template>

<style scoped>
.bc { position: relative; margin: 0; }
svg { display: block; width: 100%; height: auto; overflow: visible; }
.grid line { stroke: var(--line); stroke-width: 1; stroke-dasharray: 2 4; }
.grid line.base { stroke: var(--tea); stroke-dasharray: none; opacity: 0.6; }
.grid text, .xl, .yl, .val { font-size: 11px; fill: var(--tea); font-family: var(--sans); font-variant-numeric: tabular-nums; }
.yl { fill: var(--ink); font-size: 12px; }
.val { fill: var(--ink); }
.bar { fill: var(--qinghua); transition: opacity 0.15s; }
.bar.dim { opacity: 0.35; }
.hit { fill: transparent; cursor: default; }
.tip {
  position: absolute; transform: translate(-50%, calc(-100% - 10px)); pointer-events: none; z-index: 2;
  display: grid; gap: 1px; padding: 8px 12px; min-width: 96px; white-space: nowrap;
  background: var(--paper); border: 1px solid var(--line); border-radius: 4px; font-size: 13px;
  box-shadow: 0 4px 14px rgba(43, 33, 24, 0.12);
}
.tip strong { font-weight: 600; }
</style>
