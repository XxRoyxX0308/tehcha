<script setup lang="ts">
import { ref, watch } from 'vue'
import StoreReviews from '@/components/StoreReviews.vue'
import { useCatalog } from '@/stores/catalog'
import { useStaff } from '@/stores/staff'

// SRMS-F-007: staff read every store's reviews; their own store is selected first.
const staff = useStaff()
const catalog = useCatalog()
const storeId = ref(staff.storeId || catalog.stores[0]?.id || 0)
watch(() => staff.storeId, (id) => { if (id) storeId.value = id })
</script>

<template>
  <div class="stack" style="--gap: 20px">
    <header>
      <p class="en">Store reviews</p>
      <h1>門市評論</h1>
    </header>
    <div class="row" style="flex-wrap: wrap">
      <button v-for="s in catalog.stores" :key="s.id" class="chip" :aria-pressed="storeId === s.id" @click="storeId = s.id">{{ s.name }}</button>
    </div>
    <section class="panel"><StoreReviews v-if="storeId" :store-id="storeId" /></section>
  </div>
</template>
