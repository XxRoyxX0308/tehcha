// SCMS 購物車子系統 (SCMS-F-001..005, CUI-004)
import { z } from 'zod'
import { one, q, tx, type Db } from '../db.ts'
import { computeTotals, type PriceLine } from '../domain/pricing.ts'
import { businessDate } from '../domain/time.ts'
import { bad, conflict, notFound, parse } from '../errors.ts'
import { activeDiscounts } from './dis.ts'

// ─── Line validation shared by cart, quote and checkout ─────────────────────

interface OptionInfo { id: number; type: 'sweetness' | 'ice' | 'topping'; name: string; extraPrice: number }
export interface ProductInfo { id: number; name: string; price: number; isDeleted: boolean; allowed: Map<number, OptionInfo> }

export async function loadProducts(db: Db | undefined, productIds: number[]): Promise<Map<number, ProductInfo>> {
  const ids = [...new Set(productIds)]
  const rows = await q<{ id: number; name: string; price: number; isDeleted: boolean; options: OptionInfo[] | null }>(
    `SELECT p.product_id AS id, p.name, p.price, p.is_deleted AS "isDeleted",
            (SELECT json_agg(json_build_object('id', o.option_id, 'type', o.type, 'name', o.name, 'extraPrice', o.extra_price) ORDER BY o.option_id)
             FROM product_option po JOIN custom_option o USING (option_id)
             WHERE po.product_id = p.product_id AND NOT o.is_deleted) AS options
     FROM product p WHERE p.product_id = ANY($1::int[])`, [ids], db)
  return new Map(rows.map((r) => [r.id, {
    id: r.id, name: r.name, price: r.price, isDeleted: r.isDeleted,
    allowed: new Map((r.options ?? []).map((o) => [o.id, { ...o, extraPrice: Number(o.extraPrice) }])),
  }]))
}

/** CUI-003: one sweetness and one ice level (when the drink offers them), any of its toppings. */
export function checkLine(info: ProductInfo | undefined, optionIds: number[]): { options: OptionInfo[]; optionsExtra: number } {
  if (!info || info.isDeleted) throw conflict(`${info?.name ?? '此商品'}已下架`)
  const ids = [...new Set(optionIds)]
  const options = ids.map((id) => {
    const o = info.allowed.get(id)
    if (!o) throw bad(`「${info.name}」不提供所選的客製化選項`)
    return o
  })
  for (const type of ['sweetness', 'ice'] as const) {
    const offered = [...info.allowed.values()].some((o) => o.type === type)
    const chosen = options.filter((o) => o.type === type).length
    if (offered && chosen !== 1) throw bad(`「${info.name}」請選擇一種${type === 'sweetness' ? '甜度' : '冰塊'}`)
  }
  return { options, optionsExtra: options.reduce((s, o) => s + o.extraPrice, 0) }
}

const qty = z.number().int('數量須為整數').min(1, '數量須為大於 0 的整數').max(99, '單品最多 99 杯')
const lineSchema = z.object({ productId: z.number().int().positive(), optionIds: z.array(z.number().int().positive()).max(12), quantity: qty })

// ─── Server cart for signed-in customers (SCMS-F-005: it survives logout) ───

export async function getCart(memberId: number, db?: Db) {
  return q<{ id: number; storeId: number; productId: number; quantity: number; optionIds: number[] }>(
    `SELECT ci.cart_item_id AS id, ci.store_id AS "storeId", ci.product_id AS "productId", ci.quantity,
            COALESCE(array_agg(cio.option_id ORDER BY cio.option_id) FILTER (WHERE cio.option_id IS NOT NULL), '{}') AS "optionIds"
     FROM cart_item ci LEFT JOIN cart_item_option cio USING (cart_item_id)
     WHERE ci.member_id = $1 GROUP BY ci.cart_item_id ORDER BY ci.cart_item_id`, [memberId], db)
}

const sameOptions = (a: number[], b: number[]) => a.length === b.length && [...a].sort((x, y) => x - y).every((v, i) => v === [...b].sort((x, y) => x - y)[i])

/** SCMS-F-004: the cart never holds more cups of a drink than the store has. */
async function assertStock(c: Db, memberId: number, storeId: number, productId: number, wanted: number, exceptItem?: number) {
  const r = await one<{ stock: number; inCart: number; name: string }>(
    `SELECT sp.stock_qty AS stock, p.name,
            COALESCE((SELECT sum(quantity) FROM cart_item WHERE member_id = $1 AND store_id = $2 AND product_id = $3
                      AND cart_item_id IS DISTINCT FROM $4), 0) AS "inCart"
     FROM store_product sp JOIN product p USING (product_id) WHERE sp.store_id = $2 AND sp.product_id = $3`,
    [memberId, storeId, productId, exceptItem ?? null], c)
  if (!r) throw notFound('這間門市沒有販售此商品')
  if (r.inCart + wanted > r.stock) {
    const left = Math.max(0, r.stock - r.inCart)
    throw conflict(r.stock === 0 ? `「${r.name}」已售完` : `「${r.name}」庫存不足，最多還能加 ${left} 杯`, 'stock')
  }
}

export async function addToCart(memberId: number, input: unknown) {
  const d = parse(lineSchema.extend({ storeId: z.number().int().positive() }), input)
  return tx(async (c) => {
    await q(`SELECT 1 FROM member WHERE member_id = $1 FOR UPDATE`, [memberId], c) // one cart edit at a time per member
    const info = (await loadProducts(c, [d.productId])).get(d.productId)
    checkLine(info, d.optionIds)
    await assertStock(c, memberId, d.storeId, d.productId, d.quantity)
    const cart = await getCart(memberId, c)
    const same = cart.find((i) => i.storeId === d.storeId && i.productId === d.productId && sameOptions(i.optionIds, d.optionIds))
    if (same) {
      await q(`UPDATE cart_item SET quantity = quantity + $2 WHERE cart_item_id = $1`, [same.id, d.quantity], c)
      return { id: same.id }
    }
    const row = await one<{ id: number }>(
      `INSERT INTO cart_item (member_id, store_id, product_id, quantity) VALUES ($1, $2, $3, $4) RETURNING cart_item_id AS id`,
      [memberId, d.storeId, d.productId, d.quantity], c)
    if (d.optionIds.length) {
      await q(`INSERT INTO cart_item_option (cart_item_id, option_id) SELECT $1, unnest($2::int[])`, [row!.id, [...new Set(d.optionIds)]], c)
    }
    return row!
  })
}

const updateSchema = z.object({ quantity: qty.optional(), optionIds: z.array(z.number().int().positive()).max(12).optional() })

/** SCMS-F-002: change the quantity or the options of a line. */
export async function updateCartItem(memberId: number, itemId: number, input: unknown) {
  const d = parse(updateSchema, input)
  await tx(async (c) => {
    await q(`SELECT 1 FROM member WHERE member_id = $1 FOR UPDATE`, [memberId], c)
    const cart = await getCart(memberId, c)
    const item = cart.find((i) => i.id === itemId)
    if (!item) throw notFound('購物車中沒有這個品項')
    const quantity = d.quantity ?? item.quantity
    const optionIds = d.optionIds ?? item.optionIds
    if (d.optionIds) checkLine((await loadProducts(c, [item.productId])).get(item.productId), optionIds)
    // merging into an identical line keeps one row per cup recipe
    const twin = cart.find((i) => i.id !== item.id && i.storeId === item.storeId && i.productId === item.productId && sameOptions(i.optionIds, optionIds))
    await assertStock(c, memberId, item.storeId, item.productId, quantity, item.id)
    if (twin) {
      await q(`UPDATE cart_item SET quantity = quantity + $2 WHERE cart_item_id = $1`, [twin.id, quantity], c)
      await q(`DELETE FROM cart_item WHERE cart_item_id = $1`, [item.id], c)
      return
    }
    await q(`UPDATE cart_item SET quantity = $2 WHERE cart_item_id = $1`, [item.id, quantity], c)
    if (d.optionIds) {
      await q(`DELETE FROM cart_item_option WHERE cart_item_id = $1`, [item.id], c)
      if (optionIds.length) await q(`INSERT INTO cart_item_option (cart_item_id, option_id) SELECT $1, unnest($2::int[])`, [item.id, [...new Set(optionIds)]], c)
    }
  })
}

export async function removeCartItem(memberId: number, itemId: number) {
  const r = await q(`DELETE FROM cart_item WHERE cart_item_id = $1 AND member_id = $2 RETURNING cart_item_id`, [itemId, memberId])
  if (!r.length) throw notFound('購物車中沒有這個品項')
}

/** A guest's cart joins the account at sign-in; lines that no longer fit are skipped. */
export async function mergeGuestCart(memberId: number, input: unknown) {
  const items = parse(z.array(lineSchema.extend({ storeId: z.number().int().positive() })).max(50), input)
  let skipped = 0
  for (const it of items) {
    try { await addToCart(memberId, it) } catch { skipped++ }
  }
  return { skipped }
}

// ─── Quote (SCMS-F-003): subtotal, tax, shipping, discounts and amount due ───

const quoteSchema = z.object({
  storeId: z.number().int().positive(),
  fulfillment: z.enum(['pickup', 'delivery']),
  lines: z.array(lineSchema).max(50),
  pointsRequested: z.number().int().min(0).optional().default(0),
})

export async function quote(input: unknown, memberId: number | null) {
  const d = parse(quoteSchema, input)
  const [products, discounts, member, stock] = await Promise.all([
    loadProducts(undefined, d.lines.map((l) => l.productId)),
    activeDiscounts(),
    memberId ? one<{ balance: number }>(`SELECT points_balance AS balance FROM member WHERE member_id = $1`, [memberId]) : undefined,
    q<{ productId: number; stockQty: number }>(`SELECT product_id AS "productId", stock_qty AS "stockQty" FROM store_product WHERE store_id = $1`, [d.storeId]),
  ])
  const problems: string[] = []
  const priced: (PriceLine & { cup: number; lineTotal: number; ok: boolean })[] = []
  for (const l of d.lines) {
    const info = products.get(l.productId)
    try {
      const { optionsExtra } = checkLine(info, l.optionIds)
      const cup = info!.price + optionsExtra
      priced.push({ productId: l.productId, unitPrice: info!.price, optionsExtra, quantity: l.quantity, cup, lineTotal: cup * l.quantity, ok: true })
    } catch (e) {
      problems.push((e as Error).message)
      priced.push({ productId: l.productId, unitPrice: 0, optionsExtra: 0, quantity: l.quantity, cup: 0, lineTotal: 0, ok: false })
    }
  }
  const need = new Map<number, number>()
  for (const l of d.lines) need.set(l.productId, (need.get(l.productId) ?? 0) + l.quantity)
  for (const [pid, n] of need) {
    const left = stock.find((s) => s.productId === pid)?.stockQty ?? 0
    if (n > left) problems.push(left === 0 ? `「${products.get(pid)?.name ?? '商品'}」本店已售完` : `「${products.get(pid)?.name ?? '商品'}」本店只剩 ${left} 杯`)
  }
  const totals = computeTotals({
    lines: priced.filter((l) => l.ok), fulfillment: d.fulfillment, discounts, today: businessDate(),
    pointsRequested: d.pointsRequested, pointsBalance: member?.balance ?? 0,
  })
  return { ...totals, lines: priced.map(({ cup, lineTotal, ok }) => ({ cup, lineTotal, ok })), problems, pointsBalance: member?.balance ?? 0 }
}
