<script setup lang="ts">
// Brand seal 得茶, read top to bottom like a carved 白文 stamp: red ground, paper-coloured strokes,
// slightly uneven edge and a few worn specks so it feels pressed rather than drawn.
withDefaults(defineProps<{ size?: number }>(), { size: 36 })
</script>

<template>
  <svg class="seal-svg" viewBox="0 0 30 42" :height="size" :width="(size * 30) / 42" role="img" aria-label="得茶">
    <path d="M1.6 1.9Q8 1.1 15.2 1.3T28.5 1.8Q29.2 11 28.9 21.2T28.4 40.3Q21 41.1 14.6 40.8T1.5 40.5Q.8 31 1.1 20.8T1.6 1.9Z" fill="var(--seal)" />
    <rect x="3.4" y="3.4" width="23.2" height="35.2" rx=".6" fill="none" stroke="#F8EDE4" stroke-width=".9" />
    <text x="15" y="19.4" text-anchor="middle" fill="#F8EDE4" font-size="14.2" font-weight="700" style="font-family: var(--serif)">得</text>
    <text x="15" y="34.6" text-anchor="middle" fill="#F8EDE4" font-size="14.2" font-weight="700" style="font-family: var(--serif)">茶</text>
    <g fill="var(--seal)">
      <circle cx="6.2" cy="3.5" r=".7" />
      <circle cx="26.5" cy="27" r=".6" />
      <circle cx="3.4" cy="33" r=".55" />
    </g>
    <g fill="#F8EDE4" opacity=".45">
      <circle cx="22" cy="8" r=".45" />
      <circle cx="7.5" cy="24" r=".35" />
    </g>
  </svg>
</template>

<style scoped>
.seal-svg { display: inline-block; flex: none; }
</style>
