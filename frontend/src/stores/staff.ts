import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { http } from '@/api'
import type { Store } from '@/types'

const KEY = 'bms-staff-store'

export interface StockAlert { storeId: number; storeName: string; productId: number; name: string; stockQty: number; safetyQty: number }

// The console's working store (BR-008: staff see only their own stores) and the low-stock alerts (PIS-F-006).
export const useStaff = defineStore('staff', () => {
  const stores = ref<Store[]>([])
  const alerts = ref<StockAlert[]>([])
  let saved = 0
  try { saved = Number(localStorage.getItem(KEY)) || 0 } catch { /* ignore */ }
  const storeId = ref(saved)
  const store = computed(() => stores.value.find((s) => s.id === storeId.value))

  async function load() {
    const r = await http.get<{ stores: Store[]; alerts: StockAlert[] }>('/staff/overview')
    stores.value = r.stores
    alerts.value = r.alerts
    if (!r.stores.some((s) => s.id === storeId.value) && r.stores[0]) setStore(r.stores[0].id)
  }

  async function refreshAlerts() {
    alerts.value = await http.get<StockAlert[]>('/staff/alerts')
  }

  function setStore(id: number) {
    storeId.value = id
    try { localStorage.setItem(KEY, String(id)) } catch { /* ignore */ }
  }

  return { stores, alerts, storeId, store, load, refreshAlerts, setStore }
})
