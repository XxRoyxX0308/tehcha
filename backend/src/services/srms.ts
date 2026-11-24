// SRMS 商品搜尋推薦子系統 (SRMS-F-001..007, CUI-002, CUI-007)
import { z } from 'zod'
import { one, q, tx } from '../db.ts'
import { businessDate } from '../domain/time.ts'
import { conflict, notFound, parse } from '../errors.ts'
import { activeDiscounts } from './dis.ts'
import { listCategories, listOptions, listProducts, listStores } from './pis.ts'

/** Everything the menu needs in one cacheable response (stands in for the SRS's Redis menu cache). */
export async function catalog() {
  const [categories, products, options, stores, discounts, popular] = await Promise.all([
    listCategories(), listProducts(), listOptions(), listStores(), activeDiscounts(), popularProducts(6),
  ])
  return { categories, products, options, stores, discounts, popular, today: businessDate() }
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => '\\' + m)

const searchSchema = z.object({
  q: z.string().trim().max(50).optional().default(''),
  categoryId: z.coerce.number().int().positive().optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
})

/** SRMS-F-001/002: keyword over name and description, plus category and price range. */
export async function search(params: Record<string, string | undefined>) {
  const d = parse(searchSchema, params)
  const term = d.q ? `%${escapeLike(d.q)}%` : null
  const rows = await q<{ id: number }>(
    `SELECT p.product_id AS id
     FROM product p
     WHERE NOT p.is_deleted
       AND ($1::text IS NULL OR p.name ILIKE $1 OR p.name_en ILIKE $1 OR p.description ILIKE $1 OR p.tagline ILIKE $1)
       AND ($2::int IS NULL OR p.category_id = $2)
       AND ($3::numeric IS NULL OR p.price >= $3)
       AND ($4::numeric IS NULL OR p.price <= $4)
     ORDER BY p.category_id, p.product_id`,
    [term, d.categoryId ?? null, d.minPrice ?? null, d.maxPrice ?? null])
  return rows.map((r) => r.id)
}

/** SRMS-F-003: best sellers by cups sold over the last 30 days. */
export const popularProducts = (limit = 6) =>
  q<{ productId: number; qty: number }>(
    `SELECT oi.product_id AS "productId", SUM(oi.quantity)::int AS qty
     FROM order_item oi
     JOIN orders o ON o.order_id = oi.order_id AND o.status <> 'cancelled' AND o.order_time > now() - interval '30 days'
     JOIN product p ON p.product_id = oi.product_id AND NOT p.is_deleted
     GROUP BY oi.product_id ORDER BY qty DESC, oi.product_id LIMIT $1`, [limit])

/** SRMS-F-004: the customer's own most-ordered drinks. */
export const usualFor = (memberId: number, limit = 4) =>
  q<{ productId: number; qty: number }>(
    `SELECT oi.product_id AS "productId", SUM(oi.quantity)::int AS qty
     FROM orders o JOIN order_item oi USING (order_id) JOIN product p ON p.product_id = oi.product_id AND NOT p.is_deleted
     WHERE o.member_id = $1 AND o.status <> 'cancelled'
     GROUP BY oi.product_id ORDER BY qty DESC, oi.product_id LIMIT $2`, [memberId, limit])

/** SRMS-F-005: what other people who bought this drink also bought. */
export const alsoBought = (productId: number, limit = 4) =>
  q<{ productId: number; buyers: number }>(
    `WITH buyers AS (
       SELECT DISTINCT o.member_id FROM orders o JOIN order_item oi USING (order_id)
       WHERE oi.product_id = $1 AND o.status <> 'cancelled')
     SELECT oi.product_id AS "productId", COUNT(DISTINCT o.member_id)::int AS buyers
     FROM orders o JOIN buyers b USING (member_id) JOIN order_item oi USING (order_id)
     JOIN product p ON p.product_id = oi.product_id AND NOT p.is_deleted
     WHERE oi.product_id <> $1 AND o.status <> 'cancelled'
     GROUP BY oi.product_id ORDER BY buyers DESC, oi.product_id LIMIT $2`, [productId, limit])

// ─── Store reviews (SRMS-F-006, SRMS-F-007) ─────────────────────────────────

/** Names are shown as 王*明 so reviews stay anonymous. */
export async function storeReviews(storeId: number, limit = 30) {
  const store = await one(`SELECT s.store_id AS id, s.name, COALESCE(r.avg_rating, 0) AS "avgRating", r.review_count AS "reviewCount"
                           FROM store s JOIN store_rating r USING (store_id) WHERE s.store_id = $1`, [storeId])
  if (!store) throw notFound('找不到門市')
  const [reviews, distribution] = await Promise.all([
    q(`SELECT r.review_id AS id, r.rating, r.comment, r.created_at AS "createdAt",
              CASE WHEN char_length(u.name) <= 1 THEN u.name || '*'
                   WHEN char_length(u.name) = 2 THEN left(u.name, 1) || '*'
                   ELSE left(u.name, 1) || repeat('*', char_length(u.name) - 2) || right(u.name, 1) END AS author
       FROM review r JOIN orders o USING (order_id) JOIN member m USING (member_id) JOIN users u USING (user_id)
       WHERE o.store_id = $1 ORDER BY r.created_at DESC LIMIT $2`, [storeId, limit]),
    q(`SELECT r.rating, count(*)::int AS n FROM review r JOIN orders o USING (order_id) WHERE o.store_id = $1 GROUP BY r.rating`, [storeId]),
  ])
  return { store, reviews, distribution }
}

const reviewSchema = z.object({
  rating: z.number().int('評分須為整數').min(1, '評分須為 1 至 5').max(5, '評分須為 1 至 5'),
  comment: z.string().trim().max(500, '評論最多 500 字').optional().default(''),
})

/** BR-012: only the customer who ordered, only once, only after the order closes. */
export async function addReview(memberId: number, orderId: number, input: unknown) {
  const d = parse(reviewSchema, input)
  return tx(async (c) => {
    const o = await one<{ status: string }>(`SELECT status FROM orders WHERE order_id = $1 AND member_id = $2 FOR SHARE`, [orderId, memberId], c)
    if (!o) throw notFound('找不到此訂單')
    if (o.status !== 'closed') throw conflict('訂單結案後才能評論')
    return one(`INSERT INTO review (order_id, rating, comment) VALUES ($1, $2, NULLIF($3, ''))
                RETURNING review_id AS id, rating, comment, created_at AS "createdAt"`, [orderId, d.rating, d.comment], c)
  })
}
