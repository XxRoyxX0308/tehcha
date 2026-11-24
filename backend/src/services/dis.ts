// DIS 折扣與點數子系統 (DIS-F-001..010, SUI-004, CUI-006)
import { randomInt } from 'node:crypto'
import { z } from 'zod'
import { one, q, tx, type Db } from '../db.ts'
import type { DiscountRule } from '../domain/pricing.ts'
import { businessDate, isDate } from '../domain/time.ts'
import { AppError, bad, conflict, notFound, parse } from '../errors.ts'

const RULE_COLUMNS = `
  d.discount_code AS code, d.type, d.description,
  to_char(d.start_date, 'YYYY-MM-DD') AS "startDate", to_char(d.end_date, 'YYYY-MM-DD') AS "endDate",
  d.discount_rate AS "discountRate", d.rule_type AS "ruleType", d.min_purchase_amount AS "minPurchaseAmount",
  COALESCE((SELECT array_agg(product_id ORDER BY product_id) FROM discount_product dp WHERE dp.discount_code = d.discount_code), '{}') AS "productIds"`

/** Policies live on the given business day; the pricing engine applies them automatically. */
export const activeDiscounts = (db?: Db, day = businessDate()) =>
  q<DiscountRule>(`SELECT ${RULE_COLUMNS} FROM discount d WHERE NOT d.is_deleted AND $1::date BETWEEN d.start_date AND d.end_date
                   ORDER BY d.type, d.discount_code`, [day], db)

export const listDiscounts = () =>
  q(`SELECT ${RULE_COLUMNS},
            CASE WHEN current_date_tw < d.start_date THEN 'upcoming' WHEN current_date_tw > d.end_date THEN 'ended' ELSE 'active' END AS state,
            (SELECT count(*) FROM order_discount od JOIN orders o USING (order_id) WHERE od.discount_code = d.discount_code AND o.status <> 'cancelled') AS "orderCount",
            (SELECT COALESCE(sum(od.amount), 0) FROM order_discount od JOIN orders o USING (order_id) WHERE od.discount_code = d.discount_code AND o.status <> 'cancelled') AS "amountGiven"
     FROM discount d, LATERAL (SELECT (now() AT TIME ZONE 'Asia/Taipei')::date AS current_date_tw) t
     WHERE NOT d.is_deleted
     ORDER BY CASE WHEN current_date_tw > d.end_date THEN 1 ELSE 0 END, d.start_date DESC, d.discount_code`)

const day = z.string().refine(isDate, '日期格式須為 yyyy-mm-dd')
const discountSchema = z.object({
  type: z.enum(['shipping', 'seasonal', 'special_event']),
  description: z.string().trim().min(2, '請填寫折扣說明').max(200),
  startDate: day,
  endDate: day,
  discountRate: z.number().gt(0, '折扣率須大於 0').max(1, '折扣率須介於 0 與 1').nullable().optional(),
  ruleType: z.enum(['rate', 'buy1get1']).nullable().optional(),
  minPurchaseAmount: z.number().min(0, '消費門檻不可為負數').nullable().optional(),
  productIds: z.array(z.number().int().positive()).optional().default([]),
})

type DiscountInput = z.infer<typeof discountSchema>

/** DIS-F-002: each type carries the fields it needs, and nothing else. */
function normalise(d: DiscountInput) {
  if (d.endDate < d.startDate) throw bad('結束日期不可早於開始日期')
  if (d.type === 'shipping') {
    if (d.minPurchaseAmount == null) throw bad('運費折扣須設定消費金額門檻')
    return { ...d, discountRate: null, ruleType: null, productIds: [] }
  }
  if (d.type === 'seasonal') {
    if (d.discountRate == null) throw bad('季節折扣須設定折扣率')
    return { ...d, ruleType: null, minPurchaseAmount: d.minPurchaseAmount ?? null, productIds: [] }
  }
  if (!d.ruleType) throw bad('特殊活動須選擇折扣方式（折扣率或買一送一）')
  if (d.ruleType === 'rate' && d.discountRate == null) throw bad('請設定折扣率')
  if (!d.productIds.length) throw bad('特殊活動須指定至少一項商品')
  return { ...d, discountRate: d.ruleType === 'buy1get1' ? null : d.discountRate!, minPurchaseAmount: null }
}

const PREFIX = { shipping: 'SHP', seasonal: 'SEA', special_event: 'EVT' } as const
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = (type: keyof typeof PREFIX) =>
  `${PREFIX[type]}-${Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')}`

async function linkProducts(c: Db, code: string, productIds: number[]) {
  // one row at a time so the overlap trigger names the clashing product
  for (const pid of [...new Set(productIds)].sort((a, b) => a - b)) {
    await q(`INSERT INTO discount_product (discount_code, product_id) VALUES ($1, $2)`, [code, pid], c)
  }
}

/** DIS-F-001: the system assigns a unique discount code. */
export async function createDiscount(input: unknown) {
  const d = normalise(parse(discountSchema, input))
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode(d.type)
    try {
      await tx(async (c) => {
        await q(`INSERT INTO discount (discount_code, type, description, start_date, end_date, discount_rate, rule_type, min_purchase_amount)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [code, d.type, d.description, d.startDate, d.endDate, d.discountRate, d.ruleType, d.minPurchaseAmount], c)
        await linkProducts(c, code, d.productIds)
      })
      return { code }
    } catch (e) {
      if ((e as { constraint?: string }).constraint === 'discount_pkey') continue
      throw e
    }
  }
  throw new AppError(500, '無法產生折扣代碼，請再試一次')
}

export async function updateDiscount(code: string, input: unknown) {
  const d = normalise(parse(discountSchema, input))
  await tx(async (c) => {
    const cur = await one<{ type: string }>(`SELECT type FROM discount WHERE discount_code = $1 AND NOT is_deleted FOR UPDATE`, [code], c)
    if (!cur) throw notFound('找不到折扣政策')
    if (cur.type !== d.type) throw conflict('折扣類型建立後不可更改，請另外新增一筆')
    await q(`DELETE FROM discount_product WHERE discount_code = $1`, [code], c)
    await q(`UPDATE discount SET description = $2, start_date = $3, end_date = $4, discount_rate = $5, rule_type = $6, min_purchase_amount = $7
             WHERE discount_code = $1`,
      [code, d.description, d.startDate, d.endDate, d.discountRate, d.ruleType, d.minPurchaseAmount], c)
    await linkProducts(c, code, d.productIds)
  })
}

/** Removed policies stay in the table so past orders still show what they saved. */
export async function deleteDiscount(code: string) {
  const r = await q(`UPDATE discount SET is_deleted = true WHERE discount_code = $1 AND NOT is_deleted RETURNING discount_code`, [code])
  if (!r.length) throw notFound('找不到折扣政策')
}

// ─── Points (DIS-F-008..010) ────────────────────────────────────────────────

export async function pointsOf(memberId: number) {
  const [m, logs] = await Promise.all([
    one<{ balance: number }>(`SELECT points_balance AS balance FROM member WHERE member_id = $1`, [memberId]),
    q(`SELECT p.log_id AS id, p.order_id AS "orderId", o.pickup_no AS "pickupNo", s.name AS "storeName",
              p.points_change AS change, p.reason, p.created_at AS "createdAt"
       FROM point_log p LEFT JOIN orders o ON o.order_id = p.order_id LEFT JOIN store s ON s.store_id = o.store_id
       WHERE p.member_id = $1 ORDER BY p.log_id DESC LIMIT 200`, [memberId]),
  ])
  return { balance: m?.balance ?? 0, logs }
}
