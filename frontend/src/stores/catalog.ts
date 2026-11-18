import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api'
import type { Category, CustomOption, Discount, Product, Store, StoreProduct } from '@/types'

const STORE_KEY = 'bms-store-id'

export const useCatalog = defineStore('catalog', () => {
  const categories = ref<Category[]>([])
  const products = ref<Product[]>([])
  const options = ref<CustomOption[]>([])
  const stores = ref<Store[]>([])
  const discounts = ref<Discount[]>([])
  const salesCount = ref<Record<number, number>>({})
  const stock = ref<StoreProduct[]>([])
  const ratings = ref<Record<number, { avg: number; count: number }>>({})
  const loaded = ref(false)

  let saved = 1
  try { saved = Number(localStorage.getItem(STORE_KEY)) || 1 } catch { /* ignore */ }
  const storeId = ref(saved)

  const store = computed(() => stores.value.find((s) => s.id === storeId.value) ?? stores.value[0])

  async function load() {
    const c = await api.getCatalog()
    categories.value = c.categories
    products.value = c.products
    options.value = c.options
    stores.value = c.stores
    discounts.value = c.discounts
    salesCount.value = c.salesCount
    if (!stores.value.some((s) => s.id === storeId.value)) storeId.value = stores.value[0].id
    await refreshStock()
    ratings.value = await api.getStoreRatings()
    loaded.value = true
  }

  async function refreshStock() {
    stock.value = await api.getStock(storeId.value)
  }

  async function setStore(id: number) {
    storeId.value = id
    try { localStorage.setItem(STORE_KEY, String(id)) } catch { /* ignore */ }
    await refreshStock()
  }

  const stockOf = (productId: number) => stock.value.find((s) => s.productId === productId)?.stockQty ?? 0
  const productById = (id: number) => products.value.find((p) => p.id === id)
  const optionById = (id: number) => options.value.find((o) => o.id === id)
  const categoryById = (id: number) => categories.value.find((c) => c.id === id)

  /** Active order-level and product-level campaigns today, for badges on cards. */
  const specialFor = (productId: number, today: string) =>
    discounts.value.find((d) => d.type === 'special_event' && d.startDate <= today && today <= d.endDate && d.productIds?.includes(productId))

  return {
    categories, products, options, stores, discounts, salesCount, stock, ratings, loaded, storeId, store,
    load, refreshStock, setStore, stockOf, productById, optionById, categoryById, specialFor,
  }
})
