// Mock back end. Every function is async and returns plain data, so swapping this
// module for real Laravel REST calls (SRS INT-001) won't touch any view or store.
// Data lives in localStorage under one key. Passwords are plain text HERE ONLY (mock);
// the real back end must store bcrypt hashes (UMS-N-001).

import { categories, discounts, initialStock, options, products, salesCount, stores } from '@/mock/seed'
import { canCancel, computeTotals, nextStatus } from '@/lib/pricing'
import { todayStr } from '@/lib/format'
import type {
  CartItem, Fulfillment, Member, Order, OrderItem, PointLog, Review, StoreProduct, User,
} from '@/types'

interface UserRec extends User { password: string }

interface Db {
  users: UserRec[]
  orders: Order[]
  pointLogs: PointLog[]
  reviews: Review[]
  stock: StoreProduct[]
  seq: { user: number; order: number; log: number; review: number; item: number }
}

const KEY = 'bms-db-v1'

const seedDb = (): Db => {
  const now = Date.now()
  const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString()
  const mkItem = (id: number, productId: number, qty: number, optionIds: number[]): OrderItem => {
    const pr = products.find((x) => x.id === productId)!
    return {
      id, productId, productName: pr.name, unitPrice: pr.price, quantity: qty,
      options: optionIds.map((oid) => {
        const o = options.find((x) => x.id === oid)!
        return { optionId: oid, name: o.name, extraPrice: o.extraPrice }
      }),
    }
  }
  const history: Order[] = [
    {
      id: 1, userId: 1, storeId: 1, orderTime: iso(9), fulfillment: 'pickup', pickupNo: 12, status: 'closed',
      subtotal: 165, tax: 8, shippingFee: 0, discountAmount: 0, pointsUsed: 0, totalAmount: 173, discounts: [],
      items: [mkItem(1, 5, 1, [3, 7, 11]), mkItem(2, 1, 2, [4, 9])],
    },
    {
      id: 2, userId: 1, storeId: 1, orderTime: iso(3), fulfillment: 'pickup', pickupNo: 31, status: 'closed',
      subtotal: 80, tax: 4, shippingFee: 0, discountAmount: 0, pointsUsed: 0, totalAmount: 84, discounts: [],
      items: [mkItem(3, 5, 1, [3, 7])],
    },
  ]
  return {
    users: [
      { userId: 1, loginId: 'demo', password: 'demo1234', name: '王小明', email: 'demo@example.com', address: '台北市大安區忠孝東路三段 1 號', status: 0, roles: ['customer'] },
    ],
    orders: history,
    pointLogs: [
      { id: 1, userId: 1, orderId: 1, change: 17, reason: 'earn', createdAt: iso(9) },
      { id: 2, userId: 1, orderId: 2, change: 8, reason: 'earn', createdAt: iso(3) },
    ],
    reviews: [],
    stock: initialStock(),
    seq: { user: 2, order: 3, log: 3, review: 1, item: 4 },
  }
}

let db: Db = load()

function load(): Db {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw) as Db
  } catch { /* fall through to seed */ }
  return seedDb()
}
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)) } catch { /* ignore */ } }
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))
const strip = ({ password: _p, ...u }: UserRec): User => u

export class ApiError extends Error {}
const fail = (msg: string): never => { throw new ApiError(msg) }

export const api = {
  // ---- catalog (SRMS / PIS) ----
  async getCatalog() {
    return clone({ categories, products: products.filter((p) => !p.isDeleted), options, stores, discounts, salesCount })
  },
  async getStock(storeId: number) {
    return clone(db.stock.filter((s) => s.storeId === storeId))
  },

  // ---- users (UMS) ----
  async register(input: { loginId: string; name: string; password: string; email: string; address: string }) {
    if (db.users.some((u) => u.loginId === input.loginId)) fail('此登入帳號已被使用')
    const rec: UserRec = { userId: db.seq.user++, ...input, status: 0, roles: ['customer'] }
    db.users.push(rec)
    save()
    return strip(rec)
  },
  async login(loginId: string, password: string) {
    const u = db.users.find((x) => x.loginId === loginId)
    if (!u || u.password !== password) fail('帳號或密碼錯誤')
    if (u!.status === 1) fail('此帳號已停權，請聯絡門市')
    return strip(u!)
  },
  async updateProfile(userId: number, patch: { name: string; email: string; address: string }) {
    const u = db.users.find((x) => x.userId === userId) ?? fail('找不到使用者')
    Object.assign(u, patch)
    save()
    return strip(u)
  },
  async changePassword(userId: number, oldPw: string, newPw: string) {
    const u = db.users.find((x) => x.userId === userId) ?? fail('找不到使用者')
    if (u.password !== oldPw) fail('舊密碼不正確')
    u.password = newPw
    save()
  },
  async getMember(userId: number): Promise<Member> {
    // IC-005: balance always equals the sum of PointLog.
    const bal = db.pointLogs.filter((l) => l.userId === userId).reduce((s, l) => s + l.change, 0)
    return { memberId: userId, userId, pointsBalance: bal }
  },
  async getPointLogs(userId: number) {
    return clone(db.pointLogs.filter((l) => l.userId === userId).sort((a, b) => b.id - a.id))
  },

  // ---- orders (OCS) ----
  async placeOrder(input: {
    userId: number; storeId: number; fulfillment: Fulfillment; deliveryAddress?: string
    items: CartItem[]; pointsRequested: number
  }): Promise<Order> {
    const { userId, storeId, fulfillment, items } = input
    if (!items.length) fail('購物車是空的')
    if (fulfillment === 'delivery' && !input.deliveryAddress?.trim()) fail('外送須填寫配送地址')

    // Whole thing succeeds or nothing changes (DBS-N-001): validate first, mutate after.
    const need = new Map<number, number>()
    for (const it of items) need.set(it.productId, (need.get(it.productId) ?? 0) + it.quantity)
    for (const [pid, qty] of need) {
      const row = db.stock.find((s) => s.storeId === storeId && s.productId === pid)
      const name = products.find((p) => p.id === pid)?.name ?? '商品'
      if (!row || row.stockQty < qty) fail(`「${name}」庫存不足`)
    }

    const member = await api.getMember(userId)
    const lines = items.map((it) => {
      const pr = products.find((p) => p.id === it.productId)!
      const extra = it.optionIds.reduce((s, id) => s + (options.find((o) => o.id === id)?.extraPrice ?? 0), 0)
      return { productId: it.productId, unitPrice: pr.price, optionsExtra: extra, quantity: it.quantity }
    })
    const t = computeTotals({
      lines, fulfillment, discounts, today: todayStr(),
      pointsRequested: input.pointsRequested, pointsBalance: member.pointsBalance,
    })

    const todaysCount = db.orders.filter((o) => o.storeId === storeId && o.orderTime.slice(0, 10) === new Date().toISOString().slice(0, 10)).length
    const order: Order = {
      id: db.seq.order++, userId, storeId, orderTime: new Date().toISOString(), fulfillment,
      deliveryAddress: fulfillment === 'delivery' ? input.deliveryAddress!.trim() : undefined,
      pickupNo: todaysCount + 1, status: 'received',
      subtotal: t.subtotal, tax: t.tax, shippingFee: t.shippingFee, discountAmount: t.discountAmount,
      pointsUsed: t.pointsUsed, totalAmount: t.total, discounts: t.applied,
      items: items.map((it) => {
        const pr = products.find((p) => p.id === it.productId)!
        return {
          id: db.seq.item++, productId: pr.id, productName: pr.name, unitPrice: pr.price, quantity: it.quantity,
          options: it.optionIds.map((oid) => {
            const o = options.find((x) => x.id === oid)!
            return { optionId: oid, name: o.name, extraPrice: o.extraPrice }
          }),
        }
      }),
    }
    for (const [pid, qty] of need) db.stock.find((s) => s.storeId === storeId && s.productId === pid)!.stockQty -= qty
    if (t.pointsUsed > 0) {
      db.pointLogs.push({ id: db.seq.log++, userId, orderId: order.id, change: -t.pointsUsed, reason: 'redeem', createdAt: new Date().toISOString() })
    }
    db.orders.push(order)
    save()
    return clone(order)
  },
  async listOrders(userId: number) {
    return clone(db.orders.filter((o) => o.userId === userId).sort((a, b) => b.id - a.id))
  },
  async getOrder(orderId: number, userId: number) {
    const o = db.orders.find((x) => x.id === orderId && x.userId === userId)
    if (!o) fail('找不到此訂單')
    return clone(o!)
  },
  async cancelOrder(orderId: number, userId: number) {
    const o = db.orders.find((x) => x.id === orderId && x.userId === userId) ?? fail('找不到此訂單')
    if (!canCancel(o.status)) fail('訂單已進入製作，無法取消')
    // BR-006: restore stock and points.
    for (const it of o.items) {
      const row = db.stock.find((s) => s.storeId === o.storeId && s.productId === it.productId)
      if (row) row.stockQty += it.quantity
    }
    if (o.pointsUsed > 0) {
      db.pointLogs.push({ id: db.seq.log++, userId, orderId: o.id, change: o.pointsUsed, reason: 'refund', createdAt: new Date().toISOString() })
    }
    db.orders = db.orders.filter((x) => x.id !== orderId)
    save()
  },
  // DEMO ONLY: stands in for the staff board (SUI-001) until the employee end exists.
  async demoAdvanceOrder(orderId: number, userId: number) {
    const o = db.orders.find((x) => x.id === orderId && x.userId === userId) ?? fail('找不到此訂單')
    const n = nextStatus(o.status)
    if (!n) return clone(o)
    o.status = n
    if (n === 'closed' && o.totalAmount >= 10) {
      // BR-003: points are credited when the order closes.
      db.pointLogs.push({ id: db.seq.log++, userId, orderId: o.id, change: Math.floor(o.totalAmount / 10), reason: 'earn', createdAt: new Date().toISOString() })
    }
    save()
    return clone(o)
  },

  // ---- reviews (SRMS-F-006/007) ----
  async addReview(input: { orderId: number; userId: number; rating: number; comment: string }) {
    const o = db.orders.find((x) => x.id === input.orderId && x.userId === input.userId) ?? fail('找不到此訂單')
    if (o.status !== 'closed') fail('訂單結案後才能評論')
    if (db.reviews.some((r) => r.orderId === o.id)) fail('此訂單已評論過')
    if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) fail('評分須為 1 至 5')
    const r: Review = { id: db.seq.review++, orderId: o.id, userId: input.userId, storeId: o.storeId, rating: input.rating, comment: input.comment.trim(), createdAt: new Date().toISOString() }
    db.reviews.push(r)
    save()
    return clone(r)
  },
  async getReviewForOrder(orderId: number) {
    const r = db.reviews.find((x) => x.orderId === orderId)
    return r ? clone(r) : null
  },
  async getStoreRatings() {
    const out: Record<number, { avg: number; count: number }> = {}
    for (const s of stores) {
      const rs = db.reviews.filter((r) => r.storeId === s.id)
      out[s.id] = { avg: rs.length ? rs.reduce((a, r) => a + r.rating, 0) / rs.length : 0, count: rs.length }
    }
    return out
  },

  // Dev helper so you can get back to the seed data.
  async resetDemoData() { db = seedDb(); save() },
}
