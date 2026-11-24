// OCS 訂單與自取子系統 (OCS-F-001..008, SUI-001, CUI-005)
import { z } from 'zod'
import { assertStore, type SessionUser } from '../auth.ts'
import { one, q, tx, type Db } from '../db.ts'
import { env } from '../env.ts'
import { canCancel, nextStatus, STATUS_ZH, type OrderStatus } from '../domain/orderFlow.ts'
import { computeTotals, pointsFor } from '../domain/pricing.ts'
import { businessDate } from '../domain/time.ts'
import { AppError, bad, conflict, notFound, parse } from '../errors.ts'
import { sendMail } from '../mail.ts'
import { activeDiscounts } from './dis.ts'
import { checkLine, getCart, loadProducts } from './scms.ts'

const ORDER_SELECT = `
SELECT o.order_id AS id, o.member_id AS "memberId", o.store_id AS "storeId", s.name AS "storeName",
       o.order_time AS "orderTime", o.fulfillment_type AS fulfillment, o.delivery_address AS "deliveryAddress",
       o.pickup_no AS "pickupNo", o.status, o.subtotal, o.tax, o.shipping_fee AS "shippingFee",
       o.discount_amount AS "discountAmount", o.points_used AS "pointsUsed", o.total_amount AS "totalAmount",
       u.name AS "customerName",
       (SELECT json_agg(json_build_object(
                 'id', oi.order_item_id, 'productId', oi.product_id, 'productName', oi.product_name,
                 'unitPrice', oi.unit_price, 'quantity', oi.quantity,
                 'options', COALESCE((SELECT json_agg(json_build_object('optionId', x.option_id, 'name', x.option_name, 'extraPrice', x.extra_price) ORDER BY x.option_id)
                                      FROM order_item_option x WHERE x.order_item_id = oi.order_item_id), '[]'::json))
               ORDER BY oi.order_item_id)
        FROM order_item oi WHERE oi.order_id = o.order_id) AS items,
       COALESCE((SELECT json_agg(json_build_object('code', od.discount_code, 'type', d.type, 'description', d.description, 'amount', od.amount)
                                 ORDER BY CASE d.type WHEN 'special_event' THEN 1 WHEN 'seasonal' THEN 2 ELSE 3 END)
                 FROM order_discount od JOIN discount d USING (discount_code) WHERE od.order_id = o.order_id), '[]'::json) AS discounts,
       COALESCE((SELECT json_agg(json_build_object('status', l.status, 'at', l.changed_at) ORDER BY l.changed_at)
                 FROM order_status_log l WHERE l.order_id = o.order_id), '[]'::json) AS timeline,
       (SELECT json_build_object('id', r.review_id, 'rating', r.rating, 'comment', r.comment, 'createdAt', r.created_at)
        FROM review r WHERE r.order_id = o.order_id) AS review,
       (SELECT p.points_change FROM point_log p WHERE p.order_id = o.order_id AND p.reason = 'earn') AS "pointsEarned"
FROM orders o
JOIN store s ON s.store_id = o.store_id
JOIN member m ON m.member_id = o.member_id
JOIN users u ON u.user_id = m.user_id`

export interface OrderView {
  id: number; memberId: number; storeId: number; storeName: string; orderTime: string; fulfillment: 'pickup' | 'delivery'
  deliveryAddress: string | null; pickupNo: number; status: OrderStatus; subtotal: number; tax: number; shippingFee: number
  discountAmount: number; pointsUsed: number; totalAmount: number; customerName: string
  items: { id: number; productId: number; productName: string; unitPrice: number; quantity: number; options: { optionId: number; name: string; extraPrice: number }[] }[]
  discounts: { code: string; type: string; description: string; amount: number }[]
  timeline: { status: OrderStatus; at: string }[]
  review: { id: number; rating: number; comment: string | null; createdAt: string } | null
  pointsEarned: number | null
}

// ─── Checkout (OCS-F-001, OCS-F-002, DBS-N-001) ─────────────────────────────

const placeSchema = z.object({
  storeId: z.number().int().positive(),
  fulfillment: z.enum(['pickup', 'delivery']),
  deliveryAddress: z.string().trim().max(200).optional().default(''),
  pointsRequested: z.number().int().min(0).optional().default(0),
  expectedTotal: z.number().min(0).optional(),
})

/** Turns the customer's cart for one store into an order. Stock, points, lines, discounts and the
 *  pickup number are written in one transaction: if any step fails, nothing is kept. */
export async function placeOrder(member: SessionUser & { memberId: number }, input: unknown) {
  const d = parse(placeSchema, input)
  if (d.fulfillment === 'delivery' && !d.deliveryAddress) throw bad('外送須填寫配送地址')

  const placed = await tx(async (c) => {
    // serialises checkouts of one member (double clicks, two tabs) and fixes the points balance
    const m = await one<{ balance: number }>(`SELECT points_balance AS balance FROM member WHERE member_id = $1 FOR UPDATE`, [member.memberId], c)
    const cart = (await getCart(member.memberId, c)).filter((i) => i.storeId === d.storeId)
    if (!cart.length) throw bad('購物車裡沒有這間門市的商品')

    const products = await loadProducts(c, cart.map((i) => i.productId))
    const lines = cart.map((i) => {
      const info = products.get(i.productId)!
      const { options, optionsExtra } = checkLine(info, i.optionIds)
      return { ...i, name: info.name, unitPrice: info.price, optionsExtra, options }
    })
    const totals = computeTotals({
      lines, fulfillment: d.fulfillment, discounts: await activeDiscounts(c), today: businessDate(),
      pointsRequested: d.pointsRequested, pointsBalance: m!.balance,
    })
    if (d.expectedTotal !== undefined && Math.abs(d.expectedTotal - totals.total) > 0.001) {
      throw new AppError(409, `應付金額已更新為 NT$${totals.total}，請確認後再送出`, 'price_changed', { total: totals.total })
    }

    // PIS-F-005: deduct stock. The WHERE makes it atomic, so concurrent orders can never take stock below 0 (TR-003).
    const need = new Map<number, number>()
    for (const l of lines) need.set(l.productId, (need.get(l.productId) ?? 0) + l.quantity)
    for (const [pid, n] of [...need].sort((a, b) => a[0] - b[0])) { // fixed lock order: no deadlocks
      const r = await q(`UPDATE store_product SET stock_qty = stock_qty - $3 WHERE store_id = $1 AND product_id = $2 AND stock_qty >= $3 RETURNING stock_qty`,
        [d.storeId, pid, n], c)
      if (!r.length) {
        const left = await one<{ s: number }>(`SELECT stock_qty AS s FROM store_product WHERE store_id = $1 AND product_id = $2`, [d.storeId, pid], c)
        throw conflict(`「${products.get(pid)?.name}」庫存不足，本店剩 ${left?.s ?? 0} 杯`, 'stock')
      }
    }

    // pickup numbers restart every business day per store
    await q(`SELECT pg_advisory_xact_lock(9001, $1)`, [d.storeId], c)
    const no = await one<{ n: number }>(
      `SELECT COALESCE(MAX(pickup_no), 0) + 1 AS n FROM orders
       WHERE store_id = $1 AND (order_time AT TIME ZONE 'Asia/Taipei')::date = (now() AT TIME ZONE 'Asia/Taipei')::date`, [d.storeId], c)

    const order = await one<{ id: number; pickupNo: number }>(
      `INSERT INTO orders (member_id, store_id, fulfillment_type, delivery_address, pickup_no, subtotal, tax, shipping_fee,
                           discount_amount, points_used, total_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING order_id AS id, pickup_no AS "pickupNo"`,
      [member.memberId, d.storeId, d.fulfillment, d.fulfillment === 'delivery' ? d.deliveryAddress : null, no!.n,
       totals.subtotal, totals.tax, totals.shippingFee, totals.discountAmount, totals.pointsUsed, totals.total], c)

    for (const l of lines) {
      const item = await one<{ id: number }>(
        `INSERT INTO order_item (order_id, product_id, product_name, unit_price, quantity) VALUES ($1, $2, $3, $4, $5) RETURNING order_item_id AS id`,
        [order!.id, l.productId, l.name, l.unitPrice, l.quantity], c)
      for (const o of l.options) {
        await q(`INSERT INTO order_item_option (order_item_id, option_id, option_name, extra_price) VALUES ($1, $2, $3, $4)`,
          [item!.id, o.id, o.name, o.extraPrice], c)
      }
    }
    for (const a of totals.applied) {
      await q(`INSERT INTO order_discount (order_id, discount_code, amount) VALUES ($1, $2, $3)`, [order!.id, a.code, a.amount], c)
    }
    await q(`INSERT INTO order_status_log (order_id, status, changed_by) VALUES ($1, 'received', $2)`, [order!.id, member.userId], c)
    if (totals.pointsUsed > 0) { // DIS-F-009; the balance CHECK rejects overspending
      await q(`INSERT INTO point_log (member_id, order_id, points_change, reason) VALUES ($1, $2, $3, 'redeem')`,
        [member.memberId, order!.id, -totals.pointsUsed], c)
    }
    await q(`DELETE FROM cart_item WHERE member_id = $1 AND store_id = $2`, [member.memberId, d.storeId], c)
    return { ...order!, total: totals.total, lines }
  })

  // OCS-F-008: confirmation mail, after the commit and never blocking the order
  const mail = sendMail(member.email, `得茶 Tehcha｜訂單 #${placed.id} 已成立，取餐編號 ${String(placed.pickupNo).padStart(3, '0')}`,
    `${member.name} 你好：\n\n你的訂單已成立。\n取餐編號：${String(placed.pickupNo).padStart(3, '0')}\n` +
    placed.lines.map((l) => `・${l.name} × ${l.quantity}（${l.options.map((o) => o.name).join('、') || '無客製'}）`).join('\n') +
    `\n應付金額：NT$${placed.total}\n\n查看製作進度：${env.appUrl}/orders/${placed.id}\n`)
  return { id: placed.id, pickupNo: placed.pickupNo, mail }
}

// ─── Reading orders (OCS-F-005, OCS-F-007) ──────────────────────────────────

export async function getOrder(orderId: number, scope: { memberId?: number; storeIds?: number[] }, db?: Db): Promise<OrderView> {
  const o = await one<OrderView>(`${ORDER_SELECT} WHERE o.order_id = $1`, [orderId], db)
  if (!o) throw notFound('找不到此訂單')
  if (scope.memberId !== undefined && o.memberId !== scope.memberId) throw notFound('找不到此訂單')
  if (scope.storeIds && !scope.storeIds.includes(o.storeId)) throw notFound('找不到此訂單')
  return o
}

export async function memberOrders(memberId: number, params: { before?: string; limit?: string }) {
  const before = Number(params.before) || null
  const limit = Math.min(50, Number(params.limit) || 20)
  return q<OrderView>(`${ORDER_SELECT} WHERE o.member_id = $1 AND ($2::int IS NULL OR o.order_id < $2)
                       ORDER BY o.order_id DESC LIMIT $3`, [memberId, before, limit])
}

/** Lightweight status poll (BMS-N-003: the customer sees a change within 3 seconds). */
export async function orderStatus(orderId: number, memberId: number) {
  const r = await one<{ status: OrderStatus }>(`SELECT status FROM orders WHERE order_id = $1 AND member_id = $2`, [orderId, memberId])
  if (!r) throw notFound('找不到此訂單')
  return r
}

// ─── Cancelling (OCS-F-006, BR-006) ─────────────────────────────────────────

export async function cancelOrder(member: SessionUser & { memberId: number }, orderId: number) {
  await tx(async (c) => {
    const o = await one<{ status: OrderStatus; storeId: number; pointsUsed: number }>(
      `SELECT status, store_id AS "storeId", points_used AS "pointsUsed" FROM orders WHERE order_id = $1 AND member_id = $2 FOR UPDATE`,
      [orderId, member.memberId], c)
    if (!o) throw notFound('找不到此訂單')
    if (!canCancel(o.status)) throw conflict(o.status === 'cancelled' ? '訂單已取消' : '訂單已進入製作，無法取消')
    await q(`UPDATE orders SET status = 'cancelled' WHERE order_id = $1`, [orderId], c)
    // stock and points go back where they came from
    await q(`UPDATE store_product sp SET stock_qty = sp.stock_qty + x.qty
             FROM (SELECT product_id, SUM(quantity) AS qty FROM order_item WHERE order_id = $1 GROUP BY product_id) x
             WHERE sp.store_id = $2 AND sp.product_id = x.product_id`, [orderId, o.storeId], c)
    if (o.pointsUsed > 0) {
      await q(`INSERT INTO point_log (member_id, order_id, points_change, reason) VALUES ($1, $2, $3, 'refund')`,
        [member.memberId, orderId, o.pointsUsed], c)
    }
    await q(`INSERT INTO order_status_log (order_id, status, changed_by) VALUES ($1, 'cancelled', $2)`, [orderId, member.userId], c)
  })
}

// ─── Staff board (OCS-F-004, SUI-001) ───────────────────────────────────────

/** Open orders of the store plus what closed or was cancelled today. */
export async function storeBoard(user: SessionUser, storeId: number) {
  assertStore(user, storeId)
  return q<OrderView>(
    `${ORDER_SELECT}
     WHERE o.store_id = $1
       AND (o.status IN ('received', 'processing', 'shipping')
            OR (o.order_time AT TIME ZONE 'Asia/Taipei')::date = (now() AT TIME ZONE 'Asia/Taipei')::date)
     ORDER BY o.order_time`, [storeId])
}

const advanceSchema = z.object({ from: z.enum(['received', 'processing', 'shipping']).optional() })

/** One click moves an order one step (BR-001). `from` is what the board showed, so two clicks
 *  or two staff on the same order can't skip a step. Closing credits the member's points (DIS-F-008). */
export async function advanceOrder(user: SessionUser, orderId: number, input: unknown) {
  const d = parse(advanceSchema, input ?? {})
  return tx(async (c) => {
    const o = await one<{ status: OrderStatus; storeId: number; memberId: number; total: number }>(
      `SELECT status, store_id AS "storeId", member_id AS "memberId", total_amount AS total FROM orders WHERE order_id = $1 FOR UPDATE`, [orderId], c)
    if (!o) throw notFound('找不到此訂單')
    assertStore(user, o.storeId)
    if (d.from && d.from !== o.status) throw conflict(`這筆訂單已是「${STATUS_ZH[o.status]}」，畫面已更新`, 'stale')
    const next = nextStatus(o.status)
    if (!next) throw conflict(o.status === 'cancelled' ? '訂單已被顧客取消' : '訂單已結案')
    await q(`UPDATE orders SET status = $2 WHERE order_id = $1`, [orderId, next], c)
    await q(`INSERT INTO order_status_log (order_id, status, changed_by) VALUES ($1, $2, $3)`, [orderId, next, user.userId], c)
    let earned = 0
    if (next === 'closed') {
      earned = pointsFor(o.total)
      if (earned > 0) {
        await q(`INSERT INTO point_log (member_id, order_id, points_change, reason) VALUES ($1, $2, $3, 'earn')`, [o.memberId, orderId, earned], c)
      }
    }
    return { status: next, pointsEarned: earned }
  })
}
