<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { http, errorText } from '@/api'
import { fmtDate } from '@/lib/format'
import type { Review } from '@/types'

// SRMS-F-007: a store's average rating, how the ratings spread, and the latest reviews.
const props = defineProps<{ storeId: number }>()
const data = ref<{ store: { name: string; avgRating: number; reviewCount: number }; reviews: Review[]; distribution: { rating: number; n: number }[] } | null>(null)
const error = ref('')

watch(() => props.storeId, async (id) => {
  data.value = null
  error.value = ''
  try { data.value = await http.get(`/stores/${id}/reviews`) } catch (e) { error.value = errorText(e) }
}, { immediate: true })

const dist = computed(() => [5, 4, 3, 2, 1].map((r) => ({ r, n: data.value?.distribution.find((d) => d.rating === r)?.n ?? 0 })))
const maxN = computed(() => Math.max(1, ...dist.value.map((d) => d.n)))
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)
</script>

<template>
  <p v-if="error" class="error">{{ error }}</p>
  <p v-else-if="!data" class="muted">載入中…</p>
  <div v-else class="sr">
    <div class="sr__sum">
      <p class="avg">{{ data.store.avgRating ? data.store.avgRating.toFixed(1) : '—' }}<span>/ 5</span></p>
      <p class="small muted">{{ data.store.reviewCount }} 則評價</p>
      <ul class="dist" aria-label="評分分布">
        <li v-for="d in dist" :key="d.r">
          <span class="small">{{ d.r }} 星</span>
          <span class="track"><span class="fill" :style="{ width: `${(d.n / maxN) * 100}%` }"></span></span>
          <span class="small muted">{{ d.n }}</span>
        </li>
      </ul>
    </div>
    <ul class="list">
      <li v-if="!data.reviews.length" class="muted">還沒有評價。</li>
      <li v-for="r in data.reviews" :key="r.id">
        <div class="row between"><span class="stars" :aria-label="`${r.rating} 星`">{{ stars(r.rating) }}</span><span class="small muted">{{ r.author }} · {{ fmtDate(r.createdAt) }}</span></div>
        <p v-if="r.comment">{{ r.comment }}</p>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.sr { display: grid; grid-template-columns: 240px 1fr; gap: 32px; align-items: start; }
.avg { font-family: var(--serif); font-size: 52px; font-weight: 700; color: var(--qinghua); line-height: 1; }
.avg span { font-size: 18px; color: var(--tea); margin-left: 6px; }
.dist { list-style: none; margin: 14px 0 0; padding: 0; display: grid; gap: 6px; }
.dist li { display: grid; grid-template-columns: 36px 1fr 32px; gap: 8px; align-items: center; }
.track { height: 8px; background: var(--paper-deep); border-radius: 4px; overflow: hidden; }
.fill { display: block; height: 100%; background: var(--qinghua); border-radius: 4px; }
.list { list-style: none; margin: 0; padding: 0; }
.list li { padding: 14px 0; border-bottom: 1px solid var(--line); display: grid; gap: 4px; }
.list li:first-child { padding-top: 0; }
.stars { color: var(--seal); letter-spacing: 2px; }
@media (max-width: 720px) { .sr { grid-template-columns: 1fr; gap: 20px; } }
</style>
