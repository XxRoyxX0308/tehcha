import { defineStore } from 'pinia'
import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { http, errorText } from '@/api'
import { useCatalog } from './catalog'
import { useSession } from './session'
import type { CartItem, Fulfillment, Quote } from '@/types'

// SCMS: a guest's cart lives in this browser; a signed-in customer's cart lives in the database
// (SCMS-F-005: it is still there after logging out). At sign-in the guest cart joins the account.
const GUEST_KEY = 'bms-cart-guest'

function readGuest(): CartItem[] {
  try { return JSON.parse(localStorage.getItem(GUEST_KEY) ?? '[]') as CartItem[] } catch { return [] }
}
function writeGuest(items: CartItem[]) {
  try { localStorage.setItem(GUEST_KEY, JSON.stringify(items)) } catch { /* ignore */ }
}

const sorted = (ids: number[]) => [...new Set(ids)].sort((a, b) => a - b)
const sameRecipe = (a: number[], b: number[]) => sorted(a).join() === sorted(b).join()

export const useCart = defineStore('cart', () => {
  const catalog = useCatalog()
  const session = useSession()
  const items = ref<CartItem[]>(readGuest())
  const server = computed(() => session.isCustomer)

  async function sync() {
    if (server.value) items.value = await http.get<CartItem[]>('/cart')
    else items.value = readGuest()
  }

  // sign-in: move the guest cart into the account; sign-out: show the (empty) guest cart
  watch(() => session.user?.memberId ?? null, async (now, before) => {
    if (now && !before) {
      const guest = readGuest()
      if (guest.length) {
        await http.post('/cart/merge', guest.map(({ storeId, productId, optionIds, quantity }) => ({ storeId, productId, optionIds, quantity }))).catch(() => {})
        writeGuest([])
      }
    }
    await sync().catch(() => {})
  })

  /** SCMS-F-001: the cart shows the chosen store's lines. */
  const current = computed(() => items.value.filter((i) => i.storeId === catalog.storeId))
  const count = computed(() => current.value.reduce((s, i) => s + i.quantity, 0))
  const otherStoreCount = computed(() => items.value.filter((i) => i.storeId !== catalog.storeId).length)
  const extraOf = (optionIds: number[]) => optionIds.reduce((s, id) => s + (catalog.optionById(id)?.extraPrice ?? 0), 0)
  const inCart = (productId: number, exceptId?: number) =>
    current.value.filter((i) => i.productId === productId && i.id !== exceptId).reduce((s, i) => s + i.quantity, 0)

  async function add(productId: number, optionIds: number[], quantity: number) {
    if (server.value) {
      await http.post('/cart/items', { storeId: catalog.storeId, productId, optionIds: sorted(optionIds), quantity })
      await sync()
      return
    }
    const same = items.value.find((i) => i.storeId === catalog.storeId && i.productId === productId && sameRecipe(i.optionIds, optionIds))
    if (same) same.quantity += quantity
    else items.value.push({ id: Math.max(0, ...items.value.map((i) => i.id)) + 1, storeId: catalog.storeId, productId, optionIds: sorted(optionIds), quantity })
    writeGuest(items.value)
  }

  async function update(id: number, patch: { quantity?: number; optionIds?: number[] }) {
    if (server.value) {
      await http.patch(`/cart/items/${id}`, patch)
      await sync()
      return
    }
    const it = items.value.find((i) => i.id === id)
    if (!it) return
    if (patch.quantity !== undefined) it.quantity = patch.quantity
    if (patch.optionIds) it.optionIds = sorted(patch.optionIds)
    writeGuest(items.value)
  }

  async function remove(id: number) {
    if (server.value) {
      await http.del(`/cart/items/${id}`)
      await sync()
      return
    }
    items.value = items.value.filter((i) => i.id !== id)
    writeGuest(items.value)
  }

  return { items, current, count, otherStoreCount, extraOf, inCart, sync, add, update, remove }
})

/** SCMS-F-003: live subtotal, tax, shipping, discounts and amount due, priced by the API. */
export function useQuote(fulfillment: Ref<Fulfillment>, pointsRequested: Ref<number> = ref(0)) {
  const cart = useCart()
  const catalog = useCatalog()
  const quote = ref<Quote | null>(null)
  const error = ref('')
  const loading = ref(false)
  let seq = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  async function run() {
    const mine = ++seq
    loading.value = true
    try {
      const q = await http.post<Quote>('/quote', {
        storeId: catalog.storeId,
        fulfillment: fulfillment.value,
        pointsRequested: Math.max(0, Math.floor(Number(pointsRequested.value) || 0)),
        lines: cart.current.map(({ productId, optionIds, quantity }) => ({ productId, optionIds, quantity })),
      })
      if (mine === seq) { quote.value = q; error.value = '' }
    } catch (e) {
      if (mine === seq) error.value = errorText(e, '無法計算金額')
    } finally {
      if (mine === seq) loading.value = false
    }
  }

  const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 180) }
  watch([() => JSON.stringify(cart.current), fulfillment, pointsRequested, () => catalog.storeId], schedule, { immediate: true })
  onScopeDispose(() => clearTimeout(timer))
  return { quote, error, loading, refresh: run }
}
