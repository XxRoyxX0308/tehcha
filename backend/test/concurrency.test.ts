// TR-003: many customers checking out at once can never take stock (or points) below zero.
import { describe, expect, it } from 'vitest'
import { q } from '../src/db.ts'
import { balanceOf, client, HALF_SUGAR, LESS_ICE, newCustomer, stockOf } from './helpers.ts'

describe('concurrent orders (TR-003, DBS-N-001)', () => {
  it('sells exactly the stock that exists when 12 customers race for 5 cups', async () => {
    await q(`UPDATE store_product SET stock_qty = 20 WHERE store_id = 3 AND product_id = 12`)
    const buyers = await Promise.all(Array.from({ length: 12 }, () => newCustomer()))
    for (const b of buyers) {
      const r = await b.c.post('/cart/items', { storeId: 3, productId: 12, optionIds: [HALF_SUGAR, LESS_ICE], quantity: 1 })
      expect(r.status).toBe(201)
    }
    await q(`UPDATE store_product SET stock_qty = 5 WHERE store_id = 3 AND product_id = 12`) // stock drops after carting

    const results = await Promise.all(buyers.map((b) => b.c.post('/orders', { storeId: 3, fulfillment: 'pickup' })))
    const ok = results.filter((r) => r.status === 201)
    const refused = results.filter((r) => r.status === 409)
    expect(ok).toHaveLength(5)
    expect(refused).toHaveLength(7)
    expect(refused[0].data.code).toBe('stock')
    expect(await stockOf(3, 12)).toBe(0)

    // failed checkouts left nothing behind (all-or-nothing)
    const pickupNos = ok.map((r) => r.data.pickupNo)
    expect(new Set(pickupNos).size).toBe(5)
    const orphans = await q(`SELECT o.order_id FROM orders o WHERE NOT EXISTS (SELECT 1 FROM order_item i WHERE i.order_id = o.order_id)`)
    expect(orphans).toHaveLength(0)
  })

  it('never lets one member spend the same points twice', async () => {
    const c = client()
    await c.login('cust05', 'demo1234')
    const start = await balanceOf('cust05')
    await c.post('/cart/items', { storeId: 1, productId: 2, optionIds: [HALF_SUGAR, LESS_ICE], quantity: 1 })
    await c.post('/cart/items', { storeId: 2, productId: 2, optionIds: [HALF_SUGAR, LESS_ICE], quantity: 1 })
    await q(`INSERT INTO point_log (member_id, points_change, reason)
             SELECT m.member_id, 30 - m.points_balance, 'adjust' FROM member m JOIN users u USING (user_id) WHERE u.login_id = 'cust05'`)
    expect(await balanceOf('cust05')).toBe(30)
    const [a, b] = await Promise.all([
      c.post('/orders', { storeId: 1, fulfillment: 'pickup', pointsRequested: 25 }),
      c.post('/orders', { storeId: 2, fulfillment: 'pickup', pointsRequested: 25 }),
    ])
    expect([a.status, b.status]).toEqual([201, 201])
    const used = (await q<{ p: number }>(`SELECT points_used AS p FROM orders WHERE order_id = ANY($1::int[]) ORDER BY order_id`, [[a.data.id, b.data.id]])).map((r) => r.p)
    expect(used.reduce((s, p) => s + p, 0)).toBe(30) // the second checkout saw only what was left
    expect(await balanceOf('cust05')).toBe(0)
    expect(start).toBeGreaterThanOrEqual(0)
  })

  it('lets two staff clicks advance an order only one step', async () => {
    const { c } = await newCustomer()
    await c.post('/cart/items', { storeId: 1, productId: 4, optionIds: [HALF_SUGAR, LESS_ICE], quantity: 1 })
    const { data } = await c.post('/orders', { storeId: 1, fulfillment: 'pickup' })
    const s1 = client(); const s2 = client()
    await s1.login('staff_ntut', 'staff1234'); await s2.login('admin', 'admin1234')
    const [x, y] = await Promise.all([
      s1.post(`/staff/orders/${data.id}/advance`, { from: 'received' }),
      s2.post(`/staff/orders/${data.id}/advance`, { from: 'received' }),
    ])
    expect([x.status, y.status].sort()).toEqual([200, 409])
    expect((await c.get(`/orders/${data.id}`)).data.status).toBe('processing')
  })
})
