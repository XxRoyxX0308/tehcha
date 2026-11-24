<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Art from '@/components/Art.vue'
import { http, errorText } from '@/api'
import { STATUS_LABEL, fmtDateTime, money } from '@/lib/format'
import type { Order } from '@/types'

// OCS-F-007: time, items with unit price and quantity, total and current status.
const orders = ref<Order[] | null>(null)
const more = ref(false)
const error = ref('')
const PAGE = 20

async function load(before?: number) {
  try {
    const page = await http.get<Order[]>('/orders', { before, limit: PAGE })
    orders.value = before ? [...(orders.value ?? []), ...page] : page
    more.value = page.length === PAGE
  } catch (e) { error.value = errorText(e) }
}
onMounted(() => load())
const unit = (i: Order['items'][number]) => i.unitPrice + i.options.reduce((s, o) => s + o.extraPrice, 0)
</script>

<template>
  <div class="page wrap stack" style="--gap: 28px">
    <header class="stack" style="--gap: 6px">
      <p class="en">Orders</p>
      <h1>我的訂單</h1>
    </header>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="orders === null" class="muted">載入中…</p>
    <div v-else-if="!orders.length" class="empty">
      <Art kind="cups" class="empty__art" />
      <p class="muted">還沒有訂單。</p>
      <RouterLink to="/menu" class="btn btn--primary">開始點餐</RouterLink>
    </div>

    <template v-else>
      <ul class="list">
        <li v-for="o in orders" :key="o.id">
          <RouterLink :to="`/orders/${o.id}`" class="ord card">
            <div class="row between">
              <span class="en">#{{ o.id }} · {{ o.storeName }} · 取餐 {{ String(o.pickupNo).padStart(3, '0') }}</span>
              <span class="tag" :class="{ 'tag--blue': !['closed', 'cancelled'].includes(o.status), 'tag--red': o.status === 'cancelled' }">{{ STATUS_LABEL[o.status].zh }}</span>
            </div>
            <ul class="lines">
              <li v-for="i in o.items" :key="i.id" class="row between">
                <span>{{ i.productName }} <span class="muted small">{{ money(unit(i)) }} × {{ i.quantity }}</span></span>
              </li>
            </ul>
            <div class="row between small muted">
              <span>{{ fmtDateTime(o.orderTime) }} · {{ o.fulfillment === 'pickup' ? '自取' : '外送' }}</span>
              <span class="price">{{ money(o.totalAmount) }}</span>
            </div>
          </RouterLink>
        </li>
      </ul>
      <button v-if="more" class="btn" style="justify-self: center" @click="load(orders[orders.length - 1].id)">載入更早的訂單</button>
    </template>
  </div>
</template>

<style scoped>
.list { list-style: none; margin: 0; padding: 0; display: grid; gap: 14px; }
.ord { display: grid; gap: 10px; padding: 18px 20px; color: var(--ink); }
.ord:hover { border-color: var(--qinghua); text-decoration: none; }
.lines { list-style: none; margin: 0; padding: 0; font-family: var(--serif); font-size: 16px; display: grid; gap: 2px; }
.lines .small { font-family: var(--sans); }
.empty { display: grid; justify-items: center; gap: 16px; padding-block: 32px; }
.empty__art { width: 140px; color: var(--qinghua); }
</style>
