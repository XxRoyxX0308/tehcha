import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { http } from '@/api'
import type { Catalog, Category, CustomOption, Discount, Product, StockRow, Store } from '@/types'

const STORE_KEY = 'bms-store-id'

// The menu, stores and today's campaigns (GET /api/catalog), plus the chosen store's stock.
export const useCatalog = defineStore('catalog', () => {
  const categories = ref<Category[]>([])
  const products = ref<Product[]>([])
  const options = ref<CustomOption[]>([])
  const stores = ref<Store[]>([])
  const discounts = ref<Discount[]>([])
  const popular = ref<{ productId: number; qty: number }[]>([])
  const stock = ref<Map<number, number>>(new Map())
  const loaded = ref(false)
  const error = ref('')

  let saved = 0
  try { saved = Number(localStorage.getItem(STORE_KEY)) || 0 } catch { /* private mode */ }
  const storeId = ref(saved)
  const store = computed(() => stores.value.find((s) => s.id === storeId.value) ?? stores.value[0])

  async function load() {
    try {
      const c = await http.get<Catalog>('/catalog')
      categories.value = c.categories
      products.value = c.products
      options.value = c.options
      stores.value = c.stores
      discounts.value = c.discounts
      popular.value = c.popular
      if (!stores.value.some((s) => s.id === storeId.value) && stores.value[0]) storeId.value = stores.value[0].id
      await refreshStock()
      loaded.value = true
      error.value = ''
    } catch (e) {
      error.value = (e as Error).message
    }
  }

  async function refreshStock() {
    if (!storeId.value) return
    const rows = await http.get<StockRow[]>(`/stores/${storeId.value}/stock`)
    stock.value = new Map(rows.map((r) => [r.productId, r.stockQty]))
  }

  async function setStore(id: number) {
    storeId.value = id
    try { localStorage.setItem(STORE_KEY, String(id)) } catch { /* ignore */ }
    await refreshStock()
  }

  const stockOf = (productId: number) => stock.value.get(productId) ?? 0
  const productById = (id: number) => products.value.find((p) => p.id === id)
  const optionById = (id: number) => options.value.find((o) => o.id === id)
  const categoryById = (id: number) => categories.value.find((c) => c.id === id)
  /** Today's special event for a product, if any (DIS-F-005). */
  const specialFor = (productId: number) => discounts.value.find((d) => d.type === 'special_event' && d.productIds.includes(productId))

  return {
    categories, products, options, stores, discounts, popular, stock, loaded, error, storeId, store,
    load, refreshStock, setStore, stockOf, productById, optionById, categoryById, specialFor,
  }
})
