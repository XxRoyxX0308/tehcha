import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { useCatalog } from './catalog'
import { useSession } from './session'
import { computeTotals, type PricedLine } from '@/lib/pricing'
import { todayStr } from '@/lib/format'
import type { CartItem, Fulfillment } from '@/types'

// SCMS-F-005: a logged-in customer's cart survives logout. Kept per user in localStorage;
// a guest cart is merged into the account on login.
const keyFor = (userId: number | null) => `bms-cart-${userId ?? 'guest'}`

function read(userId: number | null): CartItem[] {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    return raw ? (JSON.parse(raw) as CartItem[]) : []
  } catch { return [] }
}

export const useCart = defineStore('cart', () => {
  const catalog = useCatalog()
  const session = useSession()
  const items = ref<CartItem[]>(read(session.user?.userId ?? null))

  watch(items, (v) => {
    try { localStorage.setItem(keyFor(session.user?.userId ?? null), JSON.stringify(v)) } catch { /* ignore */ }
  }, { deep: true })

  // Swap carts when the account changes.
  watch(() => session.user?.userId ?? null, (id, prev) => {
    if (prev === null && id !== null) {
      const guest = items.value
      const mine = read(id)
      items.value = [...mine, ...guest]
      try { localStorage.removeItem(keyFor(null)) } catch { /* ignore */ }
    } else {
      items.value = read(id)
    }
  })

  /** The cart is per store (SCMS-F-001): only items for the selected store are shown. */
  const current = computed(() => items.value.filter((i) => i.storeId === catalog.storeId))
  const count = computed(() => current.value.reduce((s, i) => s + i.quantity, 0))
  const otherStoreCount = computed(() => items.value.filter((i) => i.storeId !== catalog.storeId).length)

  const extraOf = (optionIds: number[]) =>
    optionIds.reduce((s, id) => s + (catalog.optionById(id)?.extraPrice ?? 0), 0)

  const lines = computed<PricedLine[]>(() =>
    current.value.flatMap((i) => {
      const p = catalog.productById(i.productId)
      return p ? [{ productId: p.id, unitPrice: p.price, optionsExtra: extraOf(i.optionIds), quantity: i.quantity }] : []
    }),
  )

  function totals(fulfillment: Fulfillment, pointsRequested = 0) {
    return computeTotals({
      lines: lines.value, fulfillment, discounts: catalog.discounts, today: todayStr(),
      pointsRequested, pointsBalance: session.points,
    })
  }

  const nextId = () => Math.max(0, ...items.value.map((i) => i.id)) + 1

  /** Merges identical cup + options into one line. */
  function add(productId: number, optionIds: number[], quantity: number) {
    const sorted = [...optionIds].sort((a, b) => a - b)
    const same = items.value.find(
      (i) => i.storeId === catalog.storeId && i.productId === productId && i.optionIds.join() === sorted.join(),
    )
    if (same) same.quantity += quantity
    else items.value.push({ id: nextId(), productId, storeId: catalog.storeId, optionIds: sorted, quantity })
  }

  function setQuantity(id: number, quantity: number) {
    const it = items.value.find((i) => i.id === id)
    if (it) it.quantity = quantity
  }

  function setOptions(id: number, optionIds: number[]) {
    const it = items.value.find((i) => i.id === id)
    if (it) it.optionIds = [...optionIds].sort((a, b) => a - b)
  }

  function remove(id: number) {
    items.value = items.value.filter((i) => i.id !== id)
  }

  function clearCurrent() {
    items.value = items.value.filter((i) => i.storeId !== catalog.storeId)
  }

  return { items, current, count, otherStoreCount, lines, totals, extraOf, add, setQuantity, setOptions, remove, clearCurrent }
})
