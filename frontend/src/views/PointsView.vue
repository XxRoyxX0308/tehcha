<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { http, errorText } from '@/api'
import { fmtDateTime } from '@/lib/format'
import type { PointLog } from '@/types'

// CUI-006 / DIS-F-010: balance and every change to it.
const balance = ref<number | null>(null)
const logs = ref<PointLog[] | null>(null)
const error = ref('')
const REASON = { earn: '消費累積', redeem: '結帳折抵', refund: '取消退還', adjust: '人工調整' } as const

onMounted(async () => {
  try {
    const r = await http.get<{ balance: number; logs: PointLog[] }>('/me/points')
    balance.value = r.balance
    logs.value = r.logs
  } catch (e) { error.value = errorText(e) }
})
</script>

<template>
  <div class="page wrap stack" style="--gap: 28px">
    <header class="stack" style="--gap: 6px">
      <p class="en">Tea points</p>
      <h1>茶點數</h1>
    </header>

    <section class="card bal">
      <p class="en">目前餘額</p>
      <p class="num">{{ balance ?? '—' }}<span>點</span></p>
      <p class="small muted">每實付 NT$10 累積 1 點，訂單結案後入帳；1 點折抵 NT$1，單筆最多折抵應付金額的 50%。</p>
    </section>

    <section class="stack">
      <h2>異動紀錄 <span class="en">History</span></h2>
      <p v-if="error" class="error">{{ error }}</p>
      <p v-else-if="logs === null" class="muted">載入中…</p>
      <p v-else-if="!logs.length" class="muted">還沒有紀錄。</p>
      <ul v-else class="logs">
        <li v-for="l in logs" :key="l.id" class="row between">
          <div>
            <strong>{{ REASON[l.reason] }}</strong>
            <p class="small muted">
              {{ fmtDateTime(l.createdAt) }}
              <template v-if="l.orderId"> · <RouterLink :to="`/orders/${l.orderId}`">訂單 #{{ l.orderId }}</RouterLink> {{ l.storeName }}</template>
            </p>
          </div>
          <span class="price" :class="l.change > 0 ? 'plus' : 'minus'">{{ l.change > 0 ? '+' : '' }}{{ l.change }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.bal { padding: 28px; display: grid; gap: 6px; justify-items: start; }
.num { font-family: var(--serif); font-size: 64px; line-height: 1; color: var(--qinghua); font-weight: 700; }
.num span { font-size: 20px; margin-left: 6px; color: var(--tea); }
.logs { list-style: none; margin: 0; padding: 0; }
.logs li { padding: 14px 0; border-bottom: 1px solid var(--line); }
.logs li:first-child { border-top: 1px solid var(--line); }
.plus { color: var(--qinghua); }
.minus { color: var(--seal); }
h2 .en { margin-left: 8px; }
</style>
