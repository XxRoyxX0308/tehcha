<script setup lang="ts">
import { ref } from 'vue'
import { http, systemState } from '@/api'
import Seal from './Seal.vue'

// BMS-N-005: shown to everyone except admins while the system is under maintenance.
const busy = ref(false)
async function retry() {
  busy.value = true
  try {
    const s = await http.get<{ maintenance: { enabled: boolean; message: string } }>('/status')
    if (!s.maintenance.enabled) location.reload()
    else systemState.message = s.maintenance.message || systemState.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="mt">
    <Seal :size="64" />
    <h1>系統維護中</h1>
    <p>{{ systemState.message || '我們正在更新系統，請稍後再回來點茶。' }}</p>
    <div class="row">
      <button class="btn btn--primary" :disabled="busy" @click="retry">重新檢查</button>
      <a class="btn" href="/login">管理員登入</a>
    </div>
  </main>
</template>

<style scoped>
.mt { min-height: 100dvh; display: grid; place-content: center; justify-items: center; gap: 18px; padding: 24px; text-align: center; }
.mt p { color: var(--tea); max-width: 36ch; }
</style>
