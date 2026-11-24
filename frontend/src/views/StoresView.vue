<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import StoreReviews from '@/components/StoreReviews.vue'
import { useCatalog } from '@/stores/catalog'

// CUI-007 / SRMS-F-007: every store with its average rating and reviews.
const catalog = useCatalog()
const router = useRouter()
const selected = ref(catalog.storeId || catalog.stores[0]?.id || 0)

async function orderHere(id: number) {
  await catalog.setStore(id)
  void router.push('/menu')
}
</script>

<template>
  <div class="page wrap stack" style="--gap: 28px">
    <header class="stack" style="--gap: 6px">
      <p class="en">Stores</p>
      <h1>門市與評價</h1>
    </header>

    <ul class="stores">
      <li v-for="s in catalog.stores" :key="s.id">
        <button class="store card" :aria-pressed="selected === s.id" @click="selected = s.id">
          <span class="row between"><strong>{{ s.name }}</strong><span class="rate">★ {{ s.avgRating ? s.avgRating.toFixed(1) : '—' }}</span></span>
          <span class="small muted">{{ s.address }}</span>
          <span class="small muted">{{ s.reviewCount }} 則評價</span>
        </button>
      </li>
    </ul>

    <section v-if="selected" class="stack" style="--gap: 16px">
      <div class="row between" style="flex-wrap: wrap">
        <h2>{{ catalog.stores.find((s) => s.id === selected)?.name }}的評價</h2>
        <button class="btn btn--small" @click="orderHere(selected)">在這間點餐</button>
      </div>
      <StoreReviews :store-id="selected" />
    </section>
  </div>
</template>

<style scoped>
.stores { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; }
.store { width: 100%; display: grid; gap: 4px; padding: 16px 18px; text-align: left; cursor: pointer; font: inherit; color: inherit; }
.store:hover { border-color: var(--qinghua); }
.store[aria-pressed='true'] { border-color: var(--qinghua); box-shadow: inset 0 0 0 1px var(--qinghua); }
.store strong { font-family: var(--serif); font-size: 18px; color: var(--qinghua); }
.rate { color: var(--seal); }
</style>
