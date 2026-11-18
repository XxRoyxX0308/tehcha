<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Art from '@/components/Art.vue'
import { api } from '@/api'
import { useCatalog } from '@/stores/catalog'
import { useSession } from '@/stores/session'
import { STATUS_LABEL, fmtDateTime, money } from '@/lib/format'
import type { Order } from '@/types'

const session = useSession()
const catalog = useCatalog()
const orders = ref<Order[] | null>(null)

onMounted(async () => { orders.value = await api.listOrders(session.user!.userId) })
const storeName = (id: number) => catalog.stores.find((s) => s.id === id)?.name ?? ''
const summary = (o: Order) => o.items.map((i) => `${i.productName}×${i.quantity}`).join('、')
</script>

<template>
  <div class="page wrap stack" style="--gap: 28px">
    <header class="stack" style="--gap: 6px">
      <p class="en">Orders</p>
      <h1>我的訂單</h1>
    </header>

    <p v-if="orders === null" class="muted">載入中…</p>
    <div v-else-if="!orders.length" class="empty">
      <Art kind="cups" class="empty__art" />
      <p class="muted">還沒有訂單。</p>
      <RouterLink to="/menu" class="btn btn--primary">開始點餐</RouterLink>
    </div>

    <ul v-else class="list">
      <li v-for="o in orders" :key="o.id">
        <RouterLink :to="`/orders/${o.id}`" class="ord card">
          <div class="row between">
            <span class="en">#{{ o.id }} · {{ storeName(o.storeId) }}</span>
            <span class="tag" :class="{ live: o.status !== 'closed' }">{{ STATUS_LABEL[o.status].zh }}</span>
          </div>
          <p class="sum">{{ summary(o) }}</p>
          <div class="row between small muted">
            <span>{{ fmtDateTime(o.orderTime) }} · {{ o.fulfillment === 'pickup' ? '自取' : '外送' }}</span>
            <span class="price">{{ money(o.totalAmount) }}</span>
          </div>
        </RouterLink>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.ord { display: grid; gap: 10px; padding: 18px 20px; color: var(--ink); }
.ord:hover { border-color: var(--qinghua); text-decoration: none; }
.sum { font-family: var(--serif); font-size: 17px; }
.tag { font-size: 13px; padding: 2px 12px; border: 1px solid var(--line); border-radius: 999px; color: var(--tea); }
.tag.live { border-color: var(--qinghua); color: var(--qinghua); background: var(--qinghua-wash); }
.empty { display: grid; justify-items: center; gap: 16px; padding-block: 32px; }
.empty__art { width: 140px; color: var(--qinghua); }
</style>
