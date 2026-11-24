// TR-002: the main flows end to end through the HTTP API — register, order, check out,
// brew, pick up — plus cancelling, reviewing and the role checks around them.
import { describe, expect, it } from 'vitest'
import { q } from '../src/db.ts'
import { balanceOf, client, HALF_SUGAR, LESS_ICE, newCustomer, stockOf } from './helpers.ts'

describe('customer → staff → customer', () => {
  it('registers, orders, gets the order brewed, earns points and reviews the store', async () => {
    const { c, loginId, user } = await newCustomer()
    expect(user.roles).toEqual(['customer'])
    expect(user.pointsBalance).toBe(0)

    // SRMS: search and the menu
    const search = await c.get('/products/search?q=' + encodeURIComponent('烏龍') + '&maxPrice=60')
    expect(search.data.ids).toEqual([1])

    // SCMS: cart with options, quantity checks
    const before = await stockOf(1, 3)
    expect((await c.post('/cart/items', { storeId: 1, productId: 3, optionIds: [HALF_SUGAR, LESS_ICE, 11], quantity: 2 })).status).toBe(201)
    expect((await c.post('/cart/items', { storeId: 1, productId: 3, optionIds: [LESS_ICE, HALF_SUGAR, 11], quantity: 1 })).status).toBe(201)
    const cart = (await c.get('/cart')).data
    expect(cart).toHaveLength(1) // identical recipes merge
    expect(cart[0].quantity).toBe(3)
    expect((await c.post('/cart/items', { storeId: 1, productId: 3, optionIds: [LESS_ICE], quantity: 1 })).status).toBe(400) // no sweetness
    expect((await c.post('/cart/items', { storeId: 1, productId: 3, optionIds: [HALF_SUGAR, LESS_ICE], quantity: 0 })).status).toBe(400)
    expect((await c.post('/cart/items', { storeId: 1, productId: 3, optionIds: [HALF_SUGAR, LESS_ICE], quantity: 99 })).status).toBe(409) // over stock

    // quote = order (SCMS-F-003)
    const quote = (await c.post('/quote', { storeId: 1, fulfillment: 'pickup', lines: [{ productId: 3, optionIds: [HALF_SUGAR, LESS_ICE, 11], quantity: 3 }] })).data
    expect(quote.subtotal).toBe(165)
    const placed = await c.post('/orders', { storeId: 1, fulfillment: 'pickup', expectedTotal: quote.total })
    expect(placed.status).toBe(201)
    const id = placed.data.id
    expect(await stockOf(1, 3)).toBe(before - 3)
    expect((await c.get('/cart')).data).toHaveLength(0)

    const order = (await c.get(`/orders/${id}`)).data
    expect(order).toMatchObject({ status: 'received', subtotal: 165, tax: 8, totalAmount: quote.total, fulfillment: 'pickup' })
    expect(order.items[0].options.map((o: { name: string }) => o.name)).toEqual(['半糖', '少冰', '黑糖珍珠'])

    // staff board (OCS-F-004) moves it step by step (OCS-F-003)
    const staff = client()
    await staff.login('staff_ntut', 'staff1234')
    const board = (await staff.get('/staff/stores/1/board')).data
    expect(board.some((o: { id: number }) => o.id === id)).toBe(true)
    for (const from of ['received', 'processing', 'shipping']) {
      expect((await staff.post(`/staff/orders/${id}/advance`, { from })).status).toBe(200)
    }
    expect((await staff.post(`/staff/orders/${id}/advance`, {})).status).toBe(409) // already closed

    // DIS-F-008: points arrive when the order closes
    expect(await balanceOf(loginId)).toBe(Math.floor(quote.total / 10))
    const points = (await c.get('/me/points')).data
    expect(points.logs[0]).toMatchObject({ orderId: id, reason: 'earn' })

    // SRMS-F-006: one review, after closing
    expect((await c.post(`/orders/${id}/review`, { rating: 6 })).status).toBe(400)
    expect((await c.post(`/orders/${id}/review`, { rating: 5, comment: '好喝' })).status).toBe(201)
    expect((await c.post(`/orders/${id}/review`, { rating: 4 })).status).toBe(409)
    const reviews = (await c.get('/stores/1/reviews')).data
    expect(reviews.reviews[0]).toMatchObject({ rating: 5, comment: '好喝', author: '測**客' })
  })

  it('cancels a received order and restores stock and points (OCS-F-006, BR-006)', async () => {
    const c = client()
    await c.login('demo', 'demo1234')
    const startPoints = await balanceOf('demo')
    const startStock = await stockOf(2, 5)
    await c.post('/cart/items', { storeId: 2, productId: 5, optionIds: [HALF_SUGAR, LESS_ICE], quantity: 2 })
    const r = await c.post('/orders', { storeId: 2, fulfillment: 'delivery', deliveryAddress: '台北市信義區', pointsRequested: 40 })
    expect(r.status).toBe(201)
    const order = (await c.get(`/orders/${r.data.id}`)).data
    expect(order.pointsUsed).toBe(40)
    expect(order.shippingFee).toBe(60)
    expect(await balanceOf('demo')).toBe(startPoints - 40)
    expect(await stockOf(2, 5)).toBe(startStock - 2)

    expect((await c.post(`/orders/${r.data.id}/cancel`)).status).toBe(200)
    expect(await balanceOf('demo')).toBe(startPoints)
    expect(await stockOf(2, 5)).toBe(startStock)
    expect((await c.get(`/orders/${r.data.id}`)).data.status).toBe('cancelled')
    expect((await c.post(`/orders/${r.data.id}/cancel`)).status).toBe(409)
  })

  it('refuses to cancel once brewing has started', async () => {
    const { c } = await newCustomer()
    await c.post('/cart/items', { storeId: 1, productId: 1, optionIds: [HALF_SUGAR, LESS_ICE], quantity: 1 })
    const { data } = await c.post('/orders', { storeId: 1, fulfillment: 'pickup' })
    const staff = client()
    await staff.login('staff_ntut', 'staff1234')
    await staff.post(`/staff/orders/${data.id}/advance`, { from: 'received' })
    expect((await c.post(`/orders/${data.id}/cancel`)).status).toBe(409)
  })

  it('requires a delivery address and a non-empty cart', async () => {
    const { c } = await newCustomer()
    expect((await c.post('/orders', { storeId: 1, fulfillment: 'pickup' })).status).toBe(400)
    await c.post('/cart/items', { storeId: 1, productId: 1, optionIds: [HALF_SUGAR, LESS_ICE], quantity: 1 })
    expect((await c.post('/orders', { storeId: 1, fulfillment: 'delivery' })).status).toBe(400)
  })

  it('keeps a customer cart across logout (SCMS-F-005)', async () => {
    const { c, loginId } = await newCustomer()
    await c.post('/cart/items', { storeId: 3, productId: 4, optionIds: [HALF_SUGAR, LESS_ICE], quantity: 1 })
    await c.post('/auth/logout')
    expect((await c.get('/cart')).status).toBe(401)
    await c.login(loginId, 'pass1234')
    expect((await c.get('/cart')).data).toHaveLength(1)
  })
})

describe('roles and accounts (UMS)', () => {
  it('keeps customers out of staff and admin routes, and staff out of admin (UMS-N-002)', async () => {
    const { c } = await newCustomer()
    expect((await c.get('/staff/products')).status).toBe(403)
    expect((await c.get('/admin/users')).status).toBe(403)
    expect((await client().get('/staff/products')).status).toBe(401)
    const staff = client()
    await staff.login('staff_xinyi', 'staff1234')
    expect((await staff.get('/admin/users')).status).toBe(403)
    expect((await staff.get('/staff/stores/1/board')).status).toBe(403) // BR-008: not their store
    expect((await staff.get('/staff/stores/2/board')).status).toBe(200)
  })

  it('locks an account for 15 minutes after five wrong passwords (UMS-N-003)', async () => {
    const { loginId } = await newCustomer()
    const c = client()
    const codes = []
    for (let i = 0; i < 6; i++) codes.push((await c.post('/auth/login', { loginId, password: 'nope' })).status)
    expect(codes).toEqual([401, 401, 401, 401, 423, 423])
    expect((await c.post('/auth/login', { loginId, password: 'pass1234' })).status).toBe(423)
  })

  it('stores passwords as bcrypt hashes (UMS-N-001)', async () => {
    const { loginId } = await newCustomer()
    const [row] = await q<{ h: string }>(`SELECT password_hash AS h FROM users WHERE login_id = $1`, [loginId])
    expect(row.h).toMatch(/^\$2[aby]\$10\$/)
  })

  it('lets an admin create staff, suspend accounts and warn them (UMS-F-006)', async () => {
    const admin = client()
    await admin.login('admin', 'admin1234')
    const created = await admin.post('/admin/users', { loginId: 'staff_test', name: '新進店員', email: 'st@tehcha.example', password: 'staff1234', roles: ['staff'], storeIds: [3] })
    expect(created.status).toBe(201)
    const s = client()
    expect((await s.login('staff_test', 'staff1234')).storeIds).toEqual([3])

    const { loginId, user } = await newCustomer()
    expect((await admin.post(`/admin/users/${user.userId}/warn`, { reason: '多次取消訂單' })).status).toBe(200)
    expect((await admin.post(`/admin/users/${user.userId}/status`, { status: 1 })).status).toBe(200)
    expect((await client().post('/auth/login', { loginId, password: 'pass1234' })).status).toBe(403)
    expect((await admin.post(`/admin/users/${(await admin.get('/auth/me')).data.user.userId}/status`, { status: 1 })).status).toBe(409)
  })
})
