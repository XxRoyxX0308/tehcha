<script setup lang="ts">
import { computed } from 'vue'

// Drink illustration: a domed bubble-tea cup wearing a 青花 porcelain sleeve (lotus + scrolls),
// cobalt line work, one earthy liquid colour per product. Stands in for product photos.
const props = defineProps<{ tint: string; topping?: 'none' | 'pearl' | 'jelly' | 'foam'; id?: number }>()
const uid = computed(() => `cup-${props.id ?? 0}`)

const BODY = 'M28 60H112L101.6 196.5Q100.9 205.5 92 205.5H48Q39.1 205.5 38.4 196.5Z'

const pearls = [
  [47, 197], [58.5, 198.5], [70, 198.5], [81.5, 198.5], [93, 197],
  [52.5, 187.5], [64, 188.5], [75.5, 188.5], [87, 187.5],
  [58, 178.5], [81, 179],
]
const jelly = [[46, 186, -8], [61, 190, 6], [77, 187, -4], [88, 182, 10], [54, 175, 12], [70, 176, -10]]
const ice = [[44, 74, -14], [64, 70, 9], [84, 76, -6], [54, 90, 16], [76, 92, -18]]
</script>

<template>
  <svg viewBox="0 0 140 220" fill="none" stroke="var(--qinghua)" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <defs>
      <clipPath :id="uid"><path :d="BODY" /></clipPath>
    </defs>

    <!-- ground shadow -->
    <ellipse cx="70" cy="210.5" rx="38" ry="3.6" fill="var(--ink)" opacity=".08" stroke="none" />

    <!-- wide boba straw, drawn first so the tea and lid sit over it -->
    <path d="M79 2.5L89.5 4L72.5 162L62 160.5Z" fill="var(--qinghua-wash)" stroke-width="1.6" />
    <path d="M84.2 3.3L67.3 161.2" stroke-width=".8" opacity=".5" />

    <g :clip-path="`url(#${uid})`">
      <!-- tea -->
      <rect x="0" y="68" width="140" height="150" :fill="tint" opacity=".86" stroke="none" />
      <rect x="0" y="168" width="140" height="50" fill="var(--ink)" opacity=".07" stroke="none" />
      <path d="M20 68.5Q45 66 70 68.5T120 68.5" stroke-width="1" opacity=".55" />

      <!-- milk foam cap -->
      <template v-if="topping === 'foam'">
        <rect x="0" y="68" width="140" height="24" fill="#F4EBDD" stroke="none" />
        <path d="M20 92q6 3 12 0t12 0 12 0 12 0 12 0 12 0 12 0 12 0" stroke-width="1" opacity=".6" />
        <circle v-for="(c, i) in [[46, 78], [60, 84], [78, 77], [92, 85], [68, 74]]" :key="'f' + i" :cx="c[0]" :cy="c[1]" r="1.4" fill="#fff" stroke="none" opacity=".8" />
      </template>

      <!-- ice -->
      <template v-else>
        <rect v-for="(c, i) in ice" :key="'i' + i" :x="c[0]" :y="c[1]" width="15" height="15" rx="3" :transform="`rotate(${c[2]} ${c[0] + 7.5} ${c[1] + 7.5})`" fill="#fff" fill-opacity=".32" stroke-width="1.1" stroke-opacity=".55" />
      </template>

      <!-- pearls with a highlight each -->
      <g v-if="topping === 'pearl'" stroke="none">
        <template v-for="(c, i) in pearls" :key="'p' + i">
          <circle :cx="c[0]" :cy="c[1]" r="5.6" fill="#2B2118" />
          <circle :cx="c[0] - 1.8" :cy="c[1] - 1.9" r="1.4" fill="#fff" opacity=".45" />
        </template>
      </g>

      <!-- grass jelly cubes -->
      <g v-if="topping === 'jelly'">
        <template v-for="(c, i) in jelly" :key="'j' + i">
          <rect :x="c[0]" :y="c[1]" width="12" height="12" rx="2" :transform="`rotate(${c[2]} ${c[0] + 6} ${c[1] + 6})`" fill="#2B2118" fill-opacity=".9" stroke="none" />
          <path :d="`M${c[0] + 2.5} ${c[1] + 3}h4`" stroke="#fff" stroke-opacity=".4" stroke-width="1.2" :transform="`rotate(${c[2]} ${c[0] + 6} ${c[1] + 6})`" />
        </template>
      </g>

      <!-- 青花 sleeve -->
      <rect x="0" y="112" width="140" height="44" fill="#FBF6EE" stroke="none" />
      <g stroke-width="1">
        <path d="M0 114.5H140M0 117.5H140M0 150.5H140M0 153.5H140" />
      </g>
      <g stroke-width="1.15">
        <!-- lotus -->
        <path d="M70 122C75 127 75 137 70 142C65 137 65 127 70 122Z" fill="var(--qinghua-wash)" />
        <path d="M69 142C61 141 55 135 56 128C62 129 67 134 69 142Z" fill="var(--qinghua-wash)" />
        <path d="M71 142C79 141 85 135 84 128C78 129 73 134 71 142Z" fill="var(--qinghua-wash)" />
        <path d="M70 126V138" stroke-width=".8" />
        <path d="M60 145Q70 148.5 80 145" />
        <!-- scrolls -->
        <path d="M56 139C48 145 41 140 43.5 133C45.5 128.5 50.5 129.5 49.5 133.2" />
        <path d="M84 139C92 145 99 140 96.5 133C94.5 128.5 89.5 129.5 90.5 133.2" />
        <!-- leaves -->
        <path d="M46 124Q51.5 118.5 58 122.5Q52 126.5 46 124Z" fill="var(--qinghua)" />
        <path d="M94 124Q88.5 118.5 82 122.5Q88 126.5 94 124Z" fill="var(--qinghua)" />
        <circle cx="36.5" cy="134" r="1.3" fill="var(--qinghua)" stroke="none" />
        <circle cx="103.5" cy="134" r="1.3" fill="var(--qinghua)" stroke="none" />
      </g>

      <!-- plastic sheen -->
      <path d="M36 72L42.5 188" stroke="#fff" stroke-opacity=".5" stroke-width="3" />
      <path d="M40.5 160L42 176" stroke="#fff" stroke-opacity=".35" stroke-width="1.6" />
    </g>

    <!-- cup outline -->
    <path :d="BODY" stroke-width="2" />
    <path d="M44.5 199.5H95.5" stroke-width="1" opacity=".5" />

    <!-- dome lid: translucent so the straw reads through -->
    <path d="M27.5 55C29.5 33 49 24.5 70 24.5S110.5 33 112.5 55Z" fill="var(--paper)" fill-opacity=".72" stroke-width="2" />
    <path d="M38 47C41 37 50 31.5 60 30" stroke-width="1.2" opacity=".4" />
    <ellipse cx="80.6" cy="25.5" rx="6.5" ry="1.8" fill="var(--paper)" stroke-width="1.2" />
    <rect x="21" y="53.5" width="98" height="9" rx="4.5" fill="var(--paper)" stroke-width="2" />
    <path d="M30 58H110" stroke-width=".8" opacity=".45" />
  </svg>
</template>
