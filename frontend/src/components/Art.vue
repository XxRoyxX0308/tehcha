<script setup lang="ts">
// Porcelain illustrations in a single cobalt ink, after 青花 ware:
// pot   — round teapot with a bamboo bail handle, lotus-petal shoulder band, peony medallion
// bowl  — tea bowl with steam, ruyi-cloud rim band and a three-lotus scroll
// cups  — three tasting cups, each with a different motif (plum, lotus, waves)
// sprig — 一心二葉 tea shoot: one bud, two leaves (plus a lower leaf)
defineProps<{ kind: 'pot' | 'bowl' | 'cups' | 'sprig' }>()

const r = (n: number) => Math.round(n * 10) / 10
const LEAF = 'M0 0Q6.5-5 13 0Q6.5 5 0 0Z'
const LOTUS = [
  'M0-12C5-7 5 3 0 8C-5 3-5-7 0-12Z',
  'M-1 8C-9 7-14 1-13-6C-7-5-2 0-1 8Z',
  'M1 8C9 7 14 1 13-6C7-5 2 0 1 8Z',
]

// Teapot shoulder: lotus petals sitting on the lower band line.
const potBase = (x: number) => 94 + 6 * ((x - 112) / 54) ** 2
const potPetals = Array.from({ length: 12 }, (_, i) => {
  const x = 64 + i * 8
  return `M${x} ${r(potBase(x))}Q${x + 4} ${r(potBase(x + 4) - 8)} ${x + 8} ${r(potBase(x + 8))}`
})
const potLeaves = [[78, 116, -150], [74, 146, 160], [146, 116, -30], [150, 146, 20], [100, 160, 160], [124, 160, 20]]

// Bowl rim band follows the front of the rim ellipse.
const rimFront = (x: number) => 74 + 17 * Math.sqrt(Math.max(0, 1 - ((x - 100) / 80) ** 2))
const bowlBand = 'M' + Array.from({ length: 39 }, (_, i) => { const x = 24 + i * 4; return `${x} ${r(rimFront(x) + 13)}` }).join('L')
const bowlClouds = Array.from({ length: 11 }, (_, i) => {
  const x = 35 + i * 13
  const y = rimFront(x) + 7
  return { arc: `M${x - 4} ${r(y + 1.6)}q4-5.5 8 0`, dot: [x, r(y + 3.2)] }
})
const bowlLotus = [[60, 124, 0.78], [100, 132, 1], [140, 124, 0.78]]
const bowlLeaves = [[78, 144, 170], [122, 144, 10], [40, 116, -120], [160, 116, -60], [86, 152, -160], [114, 152, -20]]

const cupY = [22, 84, 146]
const cupTea = ['#C9A24A', '#8A4B2A', '#B9B66A']
const blossom = (cx: number, cy: number, s = 1) =>
  Array.from({ length: 5 }, (_, i) => {
    const a = (i * 72 - 90) * (Math.PI / 180)
    return [r(cx + Math.cos(a) * 3.1 * s), r(cy + Math.sin(a) * 3.1 * s), r(2.5 * s)]
  })
</script>

<template>
  <!-- ───────────── teapot ───────────── -->
  <svg v-if="kind === 'pot'" viewBox="0 0 200 190" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="青花茶壺">
    <ellipse cx="112" cy="181" rx="46" ry="4" fill="currentColor" opacity=".08" stroke="none" />

    <!-- bamboo bail handle (earth tone) -->
    <path d="M80 80C77 26 147 26 144 80" stroke="var(--tea)" stroke-width="5" />
    <path d="M80 80C77 26 147 26 144 80" stroke="var(--paper)" stroke-width="1.2" opacity=".55" />
    <path d="M85.5 50l4.5 2.5M110 37.5v5M134.5 50l-4.5 2.5" stroke="var(--ink)" stroke-width="1.4" />
    <circle cx="81" cy="81" r="4" fill="var(--paper)" />
    <circle cx="143" cy="81" r="4" fill="var(--paper)" />

    <!-- spout -->
    <path d="M58 98C46 94 36 82 30 66L20 69C25 90 38 114 58 126Z" fill="var(--paper)" />
    <ellipse cx="25" cy="67.5" rx="5.4" ry="2.4" transform="rotate(-17 25 67.5)" fill="var(--paper)" />
    <path d="M28.5 78.5l8.5-2.5M32.5 90l9.5-3.5" stroke-width="1.1" />
    <path d="M37 98q5-1 7 3" stroke-width="1.1" />

    <!-- body -->
    <path d="M54 116C54 84 80 72 112 72S170 84 170 116C170 150 146 168 112 168S54 150 54 116Z" fill="var(--paper)" />

    <!-- shoulder band with lotus petals -->
    <g stroke-width="1.2">
      <path d="M62 90C84 82 140 82 162 90" />
      <path d="M58 100C82 92 142 92 166 100" />
      <path v-for="(d, i) in potPetals" :key="'pp' + i" :d="d" fill="var(--qinghua-wash)" />
    </g>

    <!-- peony medallion -->
    <ellipse cx="112" cy="130" rx="31" ry="24" fill="var(--paper)" />
    <ellipse cx="112" cy="130" rx="27" ry="20.5" stroke-width="1" />
    <g stroke-width="1.1">
      <ellipse v-for="a in [0, 45, 90, 135, 180, 225, 270, 315]" :key="'po' + a" cx="112" cy="120" rx="5.4" ry="8.4" :transform="`rotate(${a} 112 130)`" fill="var(--qinghua-wash)" />
      <ellipse v-for="a in [20, 92, 164, 236, 308]" :key="'pi' + a" cx="112" cy="124.2" rx="3.6" ry="5.4" :transform="`rotate(${a} 112 130)`" fill="var(--paper)" />
      <circle cx="112" cy="130" r="3.4" fill="currentColor" />
    </g>

    <!-- vines and leaves around the medallion -->
    <g stroke-width="1.2">
      <path d="M81 130C74 124 67.5 126 66 132.5C64.5 140 72 144 76 138.5" />
      <path d="M143 130C150 124 156.5 126 158 132.5C159.5 140 152 144 148 138.5" />
      <path v-for="(l, i) in potLeaves" :key="'pl' + i" :d="LEAF" :transform="`translate(${l[0]} ${l[1]}) rotate(${l[2]})`" fill="currentColor" />
    </g>
    <path d="M70 155C94 162 130 162 154 155" stroke-width="1.2" />

    <!-- lid + knob -->
    <path d="M88 73C90 61 134 61 136 73Z" fill="var(--paper)" />
    <path d="M95 69C102 66 122 66 129 69" stroke-width="1" />
    <path d="M105 61.5C104 53 120 53 119 61.5Z" fill="var(--qinghua-wash)" />

    <!-- foot -->
    <path d="M86 165L89.5 176H134.5L138 165" fill="var(--paper)" />
    <path d="M91 171.5H133" stroke-width="1" />
  </svg>

  <!-- ───────────── tea bowl ───────────── -->
  <svg v-else-if="kind === 'bowl'" viewBox="0 0 200 180" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="青花茶碗">
    <ellipse cx="100" cy="171" rx="40" ry="3.6" fill="currentColor" opacity=".08" stroke="none" />

    <!-- steam -->
    <g stroke-width="1.5" opacity=".45">
      <path d="M78 54C70 44 86 36 78 22" />
      <path d="M100 50C92 38 108 30 100 14" />
      <path d="M122 54C114 44 130 36 122 22" />
    </g>

    <!-- body (filled with rim arc so it reads as solid porcelain) -->
    <path d="M20 74C22 126 56 156 100 156S178 126 180 74A80 17 0 0 1 20 74Z" fill="var(--paper)" />
    <ellipse cx="100" cy="74" rx="80" ry="17" fill="var(--paper)" />
    <ellipse cx="100" cy="74" rx="74" ry="14" stroke-width="1" />
    <ellipse cx="100" cy="76.5" rx="68" ry="10.5" fill="#C9A24A" fill-opacity=".55" stroke="none" />
    <path d="M86 75Q92 70.5 98 74.5Q92 78 86 75Z" fill="var(--tea)" stroke="none" opacity=".7" />

    <!-- ruyi-cloud rim band -->
    <g stroke-width="1.1">
      <path v-for="(c, i) in bowlClouds" :key="'bc' + i" :d="c.arc" />
      <circle v-for="(c, i) in bowlClouds" :key="'bd' + i" :cx="c.dot[0]" :cy="c.dot[1]" r=".9" fill="currentColor" stroke="none" />
      <path :d="bowlBand" />
    </g>

    <!-- three-lotus scroll -->
    <g stroke-width="1.15">
      <path d="M32 110C44 132 70 148 100 150C130 148 156 132 168 110" />
      <path v-for="(l, i) in bowlLeaves" :key="'bl' + i" :d="LEAF" :transform="`translate(${l[0]} ${l[1]}) rotate(${l[2]})`" fill="currentColor" />
      <g v-for="(f, i) in bowlLotus" :key="'bf' + i" :transform="`translate(${f[0]} ${f[1]}) scale(${f[2]})`">
        <path v-for="(d, j) in LOTUS" :key="j" :d="d" fill="var(--qinghua-wash)" />
        <path d="M-9 10Q0 14 9 10" />
      </g>
    </g>

    <!-- foot -->
    <path d="M76 154L79 166H121L124 154" fill="var(--paper)" />
    <path d="M80.5 160H119.5" stroke-width="1" />
  </svg>

  <!-- ───────────── three tasting cups ───────────── -->
  <svg v-else-if="kind === 'cups'" viewBox="0 0 200 206" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="青花茶杯">
    <g v-for="(y, i) in cupY" :key="i" :transform="`translate(100 ${y})`">
      <ellipse cx="0" cy="55" rx="22" ry="2.6" fill="currentColor" opacity=".08" stroke="none" />
      <path d="M-44 0C-42 30-24 46 0 46S42 30 44 0A44 8 0 0 1-44 0Z" fill="var(--paper)" />
      <ellipse cx="0" cy="0" rx="44" ry="8" fill="var(--paper)" />
      <ellipse cx="0" cy="1.6" rx="38" ry="5.4" :fill="cupTea[i]" fill-opacity=".6" stroke="none" />
      <path d="M-42.5 9C-28 16.5 28 16.5 42.5 9" stroke-width="1" />
      <path d="M-14 45L-12 51H12L14 45" fill="var(--paper)" />

      <!-- plum branch -->
      <g v-if="i === 0" stroke-width="1.1">
        <path d="M-30 33C-18 28-6 30 4 24C13 19 20 19 28 15" stroke="var(--tea)" stroke-width="1.5" />
        <template v-for="(b, k) in [[-14, 28.5, 1], [6, 24, 1.1], [22, 17, .85]]" :key="'pb' + k">
          <circle v-for="(p, m) in blossom(b[0], b[1], b[2])" :key="m" :cx="p[0]" :cy="p[1]" :r="p[2]" fill="var(--qinghua-wash)" />
          <circle :cx="b[0]" :cy="b[1]" r="1.2" fill="currentColor" stroke="none" />
        </template>
        <circle cx="-24" cy="31" r="1.4" fill="currentColor" stroke="none" />
      </g>

      <!-- lotus -->
      <g v-else-if="i === 1" stroke-width="1.1">
        <path d="M-30 30C-20 34-12 34-8 31M30 30C20 34 12 34 8 31" />
        <path :d="LEAF" transform="translate(-30 30) rotate(-160) scale(.9)" fill="currentColor" />
        <path :d="LEAF" transform="translate(30 30) rotate(-20) scale(.9)" fill="currentColor" />
        <g transform="translate(0 26) scale(.72)">
          <path v-for="(d, j) in LOTUS" :key="j" :d="d" fill="var(--qinghua-wash)" />
          <path d="M-9 10Q0 14 9 10" />
        </g>
      </g>

      <!-- waves -->
      <g v-else stroke-width="1.1">
        <path d="M-32 24q5.5-5.5 11 0t11 0 11 0 11 0 11 0 11 0" />
        <path d="M-27 32q4.5-4.5 9 0t9 0 9 0 9 0 9 0 9 0" />
        <path d="M-10 18.6c3 0 4 3.2 1.6 3.9-1.3.4-2.1-.9-1.3-1.6M12 18.6c3 0 4 3.2 1.6 3.9-1.3.4-2.1-.9-1.3-1.6" />
      </g>
    </g>
  </svg>

  <!-- ───────────── tea sprig 一心二葉 ───────────── -->
  <svg v-else viewBox="0 0 200 200" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="茶葉嫩芽">
    <path d="M100 190C98 152 104 114 112 72C115.5 54 118 41 124 27" stroke="var(--tea)" stroke-width="3" />

    <!-- lower leaf -->
    <path d="M101 144C117 127 144 129 163 149C139 159 116 157 101 144Z" fill="var(--qinghua-wash)" />
    <path d="M101 144C122 144 142 146 163 149" stroke-width="1.2" />
    <path d="M118 144.5l5-7M132 145.5l6-8M146 147l5-6M120 145l4 6M134 146.5l5 6.5" stroke-width="1" />

    <!-- left leaf -->
    <path d="M108 98C88 76 50 82 30 118C64 127 96 121 108 98Z" fill="var(--qinghua-wash)" />
    <path d="M108 98C84 98 56 104 30 118" stroke-width="1.2" />
    <path d="M90 99.5l-4-10M72 103l-5-11M55 109l-5-9M88 100l-1 10M70 104l-1 11M53 110l0 8" stroke-width="1" />

    <!-- right leaf -->
    <path d="M112 74C128 50 158 44 180 56C160 82 132 88 112 74Z" fill="var(--qinghua-wash)" />
    <path d="M112 74C134 66 156 60 180 56" stroke-width="1.2" />
    <path d="M130 68.5l3-11M147 64l4-10M162 60l3-7M131 68l6 8M148 64l6 7.5" stroke-width="1" />

    <!-- bud -->
    <path d="M124 27C115.5 35 113.5 51 118 63C126.5 53 130.5 39 124 27Z" fill="currentColor" fill-opacity=".85" />
    <path d="M124 30C121 40 120 50 118.5 60" stroke="var(--paper)" stroke-width="1" />
    <!-- small sheath leaf at the node -->
    <path d="M116 66C108 62 104 55 105 48C112 51 116 58 116 66Z" fill="var(--qinghua-wash)" stroke-width="1.4" />
  </svg>
</template>
