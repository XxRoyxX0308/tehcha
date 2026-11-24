// The rules PostgreSQL enforces by itself (section 2.8 / 4.3), whatever client writes,
// plus discounts, reports and backup / restore through the API.
import { describe, expect, it } from 'vitest'
import { q } from '../src/db.ts'
import { app } from '../src/app.ts'
import { client } from './helpers.ts'

const fails = async (sql: string, params: unknown[] = []) => {
  try {
    await q(sql, params)
  } catch (e) {
    return (e as { code: string }).code
  }
  return 'no error'
}

describe('integrity constraints in the database', () => {
  it('rejects skipping or reversing order status (BR-001 trigger)', async () => {
    const [o] = await q<{ id: number }>(`SELECT order_id AS id FROM orders WHERE status = 'closed' LIMIT 1`)
    expect(await fails(`UPDATE orders SET status = 'processing' WHERE order_id = $1`, [o.id])).toBe('23514')
    expect(await fails(`UPDATE orders SET status = 'cancelled' WHERE order_id = $1`, [o.id])).toBe('23514')
  })

  it('keeps order amounts consistent and final (BR-002)', async () => {
    const [o] = await q<{ id: number }>(`SELECT order_id AS id FROM orders LIMIT 1`)
    expect(await fails(`UPDATE orders SET total_amount = total_amount + 1 WHERE order_id = $1`, [o.id])).toBe('23514')
    expect(await fails(`INSERT INTO orders (member_id, store_id, fulfillment_type, pickup_no, subtotal, tax, shipping_fee, total_amount)
                        VALUES (1, 1, 'pickup', 900, 100, 5, 0, 50)`)).toBe('23514')
    expect(await fails(`INSERT INTO orders (member_id, store_id, fulfillment_type, pickup_no, subtotal, tax, shipping_fee, total_amount)
                        VALUES (1, 1, 'delivery', 901, 100, 5, 60, 165)`)).toBe('23514') // delivery without an address
  })

  it('keeps stock, prices and quantities in range (IC-003, IC-007)', async () => {
    expect(await fails(`UPDATE store_product SET stock_qty = -1 WHERE store_id = 1 AND product_id = 1`)).toBe('23514')
    expect(await fails(`UPDATE product SET price = -5 WHERE product_id = 1`)).toBe('23514')
    expect(await fails(`UPDATE order_item SET quantity = 0 WHERE order_item_id = 1`)).toBe('23514')
  })

  it('keeps the points ledger append-only and the balance equal to it (IC-005)', async () => {
    expect(await fails(`UPDATE point_log SET points_change = 999 WHERE log_id = 1`)).toBe('23001')
    expect(await fails(`DELETE FROM point_log WHERE log_id = 1`)).toBe('23001')
    expect(await fails(`INSERT INTO point_log (member_id, points_change, reason) VALUES (2, -999999, 'adjust')`)).toBe('23514')
    const bad = await q(`SELECT 1 FROM member m WHERE points_balance <> (SELECT COALESCE(SUM(points_change), 0) FROM point_log p WHERE p.member_id = m.member_id)`)
    expect(bad).toHaveLength(0)
  })

  it('allows reviews only on closed orders, once (BR-012, IC-008)', async () => {
    const [open] = await q<{ id: number }>(`SELECT order_id AS id FROM orders WHERE status = 'received' LIMIT 1`)
    expect(await fails(`INSERT INTO review (order_id, rating) VALUES ($1, 5)`, [open.id])).toBe('23514')
    const [done] = await q<{ id: number }>(`SELECT order_id AS id FROM review LIMIT 1`)
    expect(await fails(`INSERT INTO review (order_id, rating) VALUES ($1, 5)`, [done.id])).toBe('23505')
    expect(await fails(`UPDATE review SET rating = 6 WHERE order_id = $1`, [done.id])).toBe('23514')
  })

  it('checks discount periods and rates (IC-006)', async () => {
    expect(await fails(`INSERT INTO discount (discount_code, type, description, start_date, end_date, discount_rate)
                        VALUES ('X1', 'seasonal', 'x', '2026-12-01', '2026-11-01', 0.1)`)).toBe('23514')
    expect(await fails(`INSERT INTO discount (discount_code, type, description, start_date, end_date, discount_rate)
                        VALUES ('X2', 'seasonal', 'x', '2026-11-01', '2026-12-01', 1.5)`)).toBe('23514')
  })
})

describe('discount policies (DIS-F-001..007)', () => {
  it('assigns codes and refuses overlapping special events on one product', async () => {
    const s = client()
    await s.login('staff_ntut', 'staff1234')
    const base = { type: 'special_event', description: '仙草蜜 9 折', ruleType: 'rate', discountRate: 0.1, productIds: [11] }
    const a = await s.post('/staff/discounts', { ...base, startDate: '2027-01-01', endDate: '2027-01-10' })
    expect(a.status).toBe(201)
    expect(a.data.code).toMatch(/^EVT-[A-Z2-9]{6}$/)
    const b = await s.post('/staff/discounts', { ...base, startDate: '2027-01-10', endDate: '2027-01-20' })
    expect(b.status).toBe(409)
    expect(b.data.code).toBe('special_event_overlap')
    expect((await s.post('/staff/discounts', { ...base, startDate: '2027-01-11', endDate: '2027-01-20' })).status).toBe(201)
    // moving the first one onto the second is caught too
    expect((await s.put(`/staff/discounts/${a.data.code}`, { ...base, startDate: '2027-01-05', endDate: '2027-01-15' })).status).toBe(409)
    expect((await s.del(`/staff/discounts/${a.data.code}`)).status).toBe(200)
    expect((await s.post('/staff/discounts', { type: 'shipping', description: '免運', startDate: '2027-01-01', endDate: '2027-01-02' })).status).toBe(400)
  })
})

describe('reports (SRS)', () => {
  it('returns period, best-seller, hourly and category reports and CSV', async () => {
    const s = client()
    await s.login('staff_xinyi', 'staff1234')
    const sales = (await s.get('/staff/reports/sales?period=month')).data
    expect(sales.rows.every((r: { storeId: number }) => r.storeId === 2)).toBe(true) // own store only
    const best = (await s.get('/staff/reports/best-sellers?top=3')).data.rows
    expect(best.length).toBeGreaterThan(0)
    expect(best[0].rank).toBe(1)
    expect((await s.get('/staff/reports/hourly')).data.rows).toHaveLength(24)
    expect((await s.get('/staff/reports/sales?storeId=1')).status).toBe(403)
    const csv = await s.get('/staff/reports/purchases?by=store&format=csv')
    expect(csv.data.startsWith('門市,訂單數')).toBe(true)
    // the raw body starts with a UTF-8 BOM so Excel reads the Chinese headers (text() strips it)
    const login = await app.request('/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ loginId: 'staff_xinyi', password: 'staff1234' }) })
    const cookie = /tehcha_session=[^;]*/.exec(login.headers.get('set-cookie') ?? '')![0]
    const raw = new Uint8Array(await (await app.request('/api/staff/reports/hourly?format=csv', { headers: { cookie } })).arrayBuffer())
    expect([...raw.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
  })
})

describe('backup and restore (DBS-F-002)', () => {
  it('restores a snapshot exactly and keeps every integrity rule', async () => {
    const admin = client()
    await admin.login('admin', 'admin1234')
    const snap = await admin.post('/admin/backups')
    expect(snap.status).toBe(201)
    const before = await q(`SELECT (SELECT count(*) FROM orders) AS o, (SELECT sum(points_balance) FROM member) AS p`)
    await q(`UPDATE product SET name = '被改掉的名稱' WHERE product_id = 1`)
    const r = await admin.post(`/admin/backups/${snap.data.id}/restore`)
    expect(r.status).toBe(200)
    expect((await q(`SELECT name FROM product WHERE product_id = 1`))[0].name).toBe('阿里山烏龍')
    expect(await q(`SELECT (SELECT count(*) FROM orders) AS o, (SELECT sum(points_balance) FROM member) AS p`)).toEqual(before)
    await admin.login('admin', 'admin1234') // the session survives because the account was restored
    const check = (await admin.get('/admin/integrity')).data
    expect(check.results.filter((x: { ok: boolean }) => !x.ok)).toEqual([])
    const list = (await admin.get('/admin/backups')).data
    expect(list.map((b: { kind: string }) => b.kind)).toContain('pre-restore')
  })

  it('shows a maintenance notice to everyone but admins (BMS-N-005)', async () => {
    const admin = client()
    await admin.login('admin', 'admin1234')
    await admin.put('/admin/maintenance', { enabled: true, message: '系統維護中' })
    const guest = await client().get('/catalog')
    expect(guest.status).toBe(503)
    expect(guest.data.code).toBe('maintenance')
    expect((await admin.get('/catalog')).status).toBe(200)
    await admin.put('/admin/maintenance', { enabled: false })
    expect((await client().get('/catalog')).status).toBe(200)
  })
})
