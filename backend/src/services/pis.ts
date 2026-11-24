// PIS 商品與庫存管理子系統 (PIS-F-001..006, SUI-002, SUI-003)
import { z } from 'zod'
import type { SessionUser } from '../auth.ts'
import { one, q, tx, type Db } from '../db.ts'
import { bad, notFound, parse } from '../errors.ts'

// ─── Products (PIS-F-001, PIS-F-002) ────────────────────────────────────────

const PRODUCT_COLUMNS = `
  p.product_id AS id, p.category_id AS "categoryId", p.name, p.name_en AS "nameEn", p.tagline,
  p.description, p.image_url AS "imageUrl", p.price, p.art_tint AS tint, p.art_topping AS topping,
  p.is_deleted AS "isDeleted",
  COALESCE((SELECT array_agg(po.option_id ORDER BY po.option_id) FROM product_option po
            JOIN custom_option o USING (option_id) WHERE po.product_id = p.product_id AND NOT o.is_deleted), '{}') AS "optionIds"`

export async function listProducts(opts: { includeDeleted?: boolean } = {}, db?: Db) {
  return q(`SELECT ${PRODUCT_COLUMNS} FROM product p WHERE $1::boolean OR NOT p.is_deleted ORDER BY p.category_id, p.product_id`,
    [!!opts.includeDeleted], db)
}

const productSchema = z.object({
  categoryId: z.number().int().positive('請選擇分類'),
  name: z.string().trim().min(1, '請填寫商品名稱').max(50),
  nameEn: z.string().trim().max(60).optional().default(''),
  tagline: z.string().trim().max(60).optional().default(''),
  description: z.string().trim().max(2000).optional().default(''),
  imageUrl: z.string().trim().max(255).refine((v) => !v || /^(https:\/\/|\/)/.test(v), '圖片網址須以 https:// 或 / 開頭').optional().default(''),
  price: z.number().min(0, '價格不可為負數').max(999999),
  tint: z.string().regex(/^#[0-9A-Fa-f]{6}$/, '顏色須為 #RRGGBB').optional().default('#B98C62'),
  topping: z.enum(['none', 'pearl', 'jelly', 'foam']).optional().default('none'),
  optionIds: z.array(z.number().int().positive()).default([]),
})

async function setProductOptions(c: Db, productId: number, optionIds: number[]) {
  await q(`DELETE FROM product_option WHERE product_id = $1`, [productId], c)
  if (optionIds.length) {
    await q(`INSERT INTO product_option (product_id, option_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING`,
      [productId, [...new Set(optionIds)]], c)
  }
}

export async function createProduct(input: unknown) {
  const d = parse(productSchema, input)
  return tx(async (c) => {
    const p = await one<{ product_id: number }>(
      `INSERT INTO product (category_id, name, name_en, tagline, description, image_url, price, art_tint, art_topping)
       VALUES ($1, $2, NULLIF($3, ''), NULLIF($4, ''), NULLIF($5, ''), NULLIF($6, ''), $7, $8, $9) RETURNING product_id`,
      [d.categoryId, d.name, d.nameEn, d.tagline, d.description, d.imageUrl, d.price, d.tint, d.topping], c)
    const id = p!.product_id
    await setProductOptions(c, id, d.optionIds)
    // every store lists the new drink, out of stock until staff count it in
    await q(`INSERT INTO store_product (store_id, product_id, stock_qty, safety_qty) SELECT store_id, $1, 0, 10 FROM store`, [id], c)
    return { id }
  })
}

export async function updateProduct(id: number, input: unknown) {
  const d = parse(productSchema, input)
  await tx(async (c) => {
    const r = await q(
      `UPDATE product SET category_id = $2, name = $3, name_en = NULLIF($4, ''), tagline = NULLIF($5, ''),
              description = NULLIF($6, ''), image_url = NULLIF($7, ''), price = $8, art_tint = $9, art_topping = $10
       WHERE product_id = $1 RETURNING product_id`,
      [id, d.categoryId, d.name, d.nameEn, d.tagline, d.description, d.imageUrl, d.price, d.tint, d.topping], c)
    if (!r.length) throw notFound('找不到商品')
    await setProductOptions(c, id, d.optionIds)
  })
}

/** Soft delete keeps every past order intact (PIS-F-001, IC-002); restore brings it back. */
export async function setProductDeleted(id: number, deleted: boolean) {
  const r = await q(`UPDATE product SET is_deleted = $2 WHERE product_id = $1 RETURNING product_id`, [id, deleted])
  if (!r.length) throw notFound('找不到商品')
  if (deleted) await q(`DELETE FROM cart_item WHERE product_id = $1`, [id])
}

// ─── Categories ─────────────────────────────────────────────────────────────

const categorySchema = z.object({ name: z.string().trim().min(1, '請填寫分類名稱').max(30), nameEn: z.string().trim().max(40).optional().default('') })

export const listCategories = (db?: Db) =>
  q(`SELECT category_id AS id, name, name_en AS "nameEn",
            (SELECT count(*) FROM product p WHERE p.category_id = c.category_id AND NOT p.is_deleted) AS "productCount"
     FROM category c ORDER BY category_id`, [], db)

export async function createCategory(input: unknown) {
  const d = parse(categorySchema, input)
  return one(`INSERT INTO category (name, name_en) VALUES ($1, NULLIF($2, '')) RETURNING category_id AS id`, [d.name, d.nameEn])
}

export async function updateCategory(id: number, input: unknown) {
  const d = parse(categorySchema, input)
  const r = await q(`UPDATE category SET name = $2, name_en = NULLIF($3, '') WHERE category_id = $1 RETURNING category_id`, [id, d.name, d.nameEn])
  if (!r.length) throw notFound('找不到分類')
}

// ─── Custom options (PIS-F-002) ─────────────────────────────────────────────

const optionSchema = z.object({
  type: z.enum(['sweetness', 'ice', 'topping']),
  name: z.string().trim().min(1, '請填寫選項名稱').max(30),
  extraPrice: z.number().min(0, '加價不可為負數').max(9999),
})

export const listOptions = (opts: { includeDeleted?: boolean } = {}, db?: Db) =>
  q(`SELECT option_id AS id, type, name, extra_price AS "extraPrice", is_deleted AS "isDeleted",
            (SELECT count(*) FROM product_option po JOIN product p USING (product_id)
             WHERE po.option_id = o.option_id AND NOT p.is_deleted) AS "productCount"
     FROM custom_option o WHERE $1::boolean OR NOT is_deleted
     ORDER BY CASE type WHEN 'sweetness' THEN 1 WHEN 'ice' THEN 2 ELSE 3 END, option_id`, [!!opts.includeDeleted], db)

export async function createOption(input: unknown) {
  const d = parse(optionSchema, input)
  return one(`INSERT INTO custom_option (type, name, extra_price) VALUES ($1, $2, $3) RETURNING option_id AS id`, [d.type, d.name, d.extraPrice])
}

export async function updateOption(id: number, input: unknown) {
  const d = parse(optionSchema.omit({ type: true }), input)
  const r = await q(`UPDATE custom_option SET name = $2, extra_price = $3 WHERE option_id = $1 RETURNING option_id`, [id, d.name, d.extraPrice])
  if (!r.length) throw notFound('找不到選項')
}

export async function setOptionDeleted(id: number, deleted: boolean) {
  const r = await q(`UPDATE custom_option SET is_deleted = $2 WHERE option_id = $1 RETURNING option_id`, [id, deleted])
  if (!r.length) throw notFound('找不到選項')
  if (deleted) await q(`DELETE FROM cart_item WHERE cart_item_id IN (SELECT cart_item_id FROM cart_item_option WHERE option_id = $1)`, [id])
}

// ─── Stores (PIS-F-003) ─────────────────────────────────────────────────────

const storeSchema = z.object({
  name: z.string().trim().min(1, '請填寫門市名稱').max(50),
  address: z.string().trim().min(1, '請填寫地址').max(200),
  contactEmail: z.string().trim().max(100).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'E-mail 格式不正確'),
  phone: z.string().trim().min(6, '請填寫電話').max(20).regex(/^[0-9()+\- ]+$/, '電話只能包含數字、括號、空白與 + -'),
})

export const listStores = (db?: Db) =>
  q(`SELECT s.store_id AS id, s.name, s.address, s.contact_email AS "contactEmail", s.phone,
            COALESCE(r.avg_rating, 0) AS "avgRating", r.review_count AS "reviewCount"
     FROM store s JOIN store_rating r USING (store_id) ORDER BY s.store_id`, [], db)

export async function createStore(input: unknown) {
  const d = parse(storeSchema, input)
  return tx(async (c) => {
    const s = await one<{ store_id: number }>(
      `INSERT INTO store (name, address, contact_email, phone) VALUES ($1, $2, $3, $4) RETURNING store_id`,
      [d.name, d.address, d.contactEmail, d.phone], c)
    await q(`INSERT INTO store_product (store_id, product_id, stock_qty, safety_qty) SELECT $1, product_id, 0, 10 FROM product`, [s!.store_id], c)
    // admins run every store
    await q(`INSERT INTO store_staff (store_id, user_id) SELECT $1, user_id FROM user_role WHERE role = 'admin'`, [s!.store_id], c)
    return { id: s!.store_id }
  })
}

export async function updateStore(id: number, input: unknown) {
  const d = parse(storeSchema, input)
  const r = await q(`UPDATE store SET name = $2, address = $3, contact_email = $4, phone = $5 WHERE store_id = $1 RETURNING store_id`,
    [id, d.name, d.address, d.contactEmail, d.phone])
  if (!r.length) throw notFound('找不到門市')
}

// ─── Stock (PIS-F-004..006) ─────────────────────────────────────────────────

/** Public view of a store's stock: sold-out products are those at 0 (PIS-F-005). */
export const publicStock = (storeId: number) =>
  q(`SELECT product_id AS "productId", stock_qty AS "stockQty" FROM store_product WHERE store_id = $1`, [storeId])

export const storeStock = (storeId: number) =>
  q(`SELECT sp.product_id AS "productId", p.name, p.category_id AS "categoryId", p.is_deleted AS "isDeleted",
            sp.stock_qty AS "stockQty", sp.safety_qty AS "safetyQty",
            sp.stock_qty = 0 AS "soldOut", sp.stock_qty < sp.safety_qty AS low
     FROM store_product sp JOIN product p USING (product_id)
     WHERE sp.store_id = $1 ORDER BY p.is_deleted, p.category_id, p.product_id`, [storeId])

const stockSchema = z.object({
  stockQty: z.number().int('庫存須為整數').min(0, '庫存不可為負數').max(1_000_000),
  safetyQty: z.number().int('安全庫存須為整數').min(0, '安全庫存不可為負數').max(1_000_000),
})

export async function setStock(storeId: number, productId: number, input: unknown) {
  const d = parse(stockSchema, input)
  const r = await q(`UPDATE store_product SET stock_qty = $3, safety_qty = $4 WHERE store_id = $1 AND product_id = $2 RETURNING product_id`,
    [storeId, productId, d.stockQty, d.safetyQty])
  if (!r.length) throw notFound('這間門市沒有販售此商品')
}

/** PIS-F-006: products under their safety level in the staff member's stores. */
export const stockAlerts = (user: SessionUser) =>
  q(`SELECT sp.store_id AS "storeId", s.name AS "storeName", sp.product_id AS "productId", p.name,
            sp.stock_qty AS "stockQty", sp.safety_qty AS "safetyQty"
     FROM store_product sp JOIN product p USING (product_id) JOIN store s USING (store_id)
     WHERE sp.store_id = ANY($1::int[]) AND NOT p.is_deleted AND sp.stock_qty < sp.safety_qty
     ORDER BY sp.stock_qty, s.store_id, p.product_id`, [user.storeIds])

export function assertPositiveId(v: string | undefined, what = '編號'): number {
  const n = Number(v)
  if (!Number.isInteger(n) || n <= 0) throw bad(`${what}不正確`)
  return n
}
