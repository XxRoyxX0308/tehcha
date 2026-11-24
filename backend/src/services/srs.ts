// SRS 銷售報表子系統 (SRS-F-001..005, SUI-005). Cancelled orders never count as sales
// (the sales_order view); days, weeks and months follow Taipei time.
import { z } from 'zod'
import type { SessionUser } from '../auth.ts'
import { q } from '../db.ts'
import { addDays, businessDate, isDate } from '../domain/time.ts'
import { bad, forbidden, parse } from '../errors.ts'

const day = z.string().refine(isDate, '日期格式須為 yyyy-mm-dd')
const rangeSchema = z.object({
  from: day.optional(),
  to: day.optional(),
  storeId: z.coerce.number().int().positive().optional(),
})

export interface Range { from: string; to: string; storeId: number | null }

/** Defaults to the last 30 days; at most two years per report. Staff see their own stores only. */
export function readRange(user: SessionUser, params: Record<string, string | undefined>): Range {
  const d = parse(rangeSchema, params)
  const to = d.to ?? businessDate()
  const from = d.from ?? addDays(to, -29)
  if (from > to) throw bad('開始日期不可晚於結束日期')
  if (from < addDays(to, -731)) throw bad('報表期間最長兩年')
  if (d.storeId && !user.storeIds.includes(d.storeId)) throw forbidden('你不是這間門市的店員')
  return { from, to, storeId: d.storeId ?? null }
}

// $1 from, $2 to, $3 store (null = every store the user runs), $4 the user's stores
const WHERE = `so.local_time >= $1::date AND so.local_time < $2::date + 1
               AND so.store_id = ANY($4::int[]) AND ($3::int IS NULL OR so.store_id = $3)`
const args = (r: Range, u: SessionUser) => [r.from, r.to, r.storeId, u.storeIds]

/** SRS-F-001: per day, week (from Monday) or month and store: orders and sales. */
export function salesByPeriod(u: SessionUser, r: Range, period: string) {
  if (!['day', 'week', 'month'].includes(period)) throw bad('期間須為 day、week 或 month')
  return q(
    `SELECT to_char(date_trunc($5, so.local_time), 'YYYY-MM-DD') AS period, s.store_id AS "storeId", s.name AS "storeName",
            COUNT(*)::int AS orders, SUM(so.total_amount) AS sales, ROUND(AVG(so.total_amount), 0) AS "avgTicket"
     FROM sales_order so JOIN store s ON s.store_id = so.store_id
     WHERE ${WHERE}
     GROUP BY 1, s.store_id, s.name ORDER BY 1, s.store_id`, [...args(r, u), period])
}

/** SRS-F-002: each store's top sellers, ranked inside the store with a window function. */
export function bestSellers(u: SessionUser, r: Range, top = 5) {
  return q(
    `SELECT * FROM (
       SELECT s.store_id AS "storeId", s.name AS "storeName", ol.product_id AS "productId", MAX(ol.product_name) AS name,
              SUM(ol.quantity)::int AS qty, SUM(ol.line_total) AS revenue,
              RANK() OVER (PARTITION BY s.store_id ORDER BY SUM(ol.quantity) DESC) AS rank
       FROM sales_order so JOIN order_line ol ON ol.order_id = so.order_id JOIN store s ON s.store_id = so.store_id
       WHERE ${WHERE}
       GROUP BY s.store_id, s.name, ol.product_id) t
     WHERE rank <= $5 ORDER BY "storeId", rank, "productId"`, [...args(r, u), top])
}

/** SRS-F-003: purchases per product or per store over a period. */
export function purchases(u: SessionUser, r: Range, by: string) {
  if (by === 'store') {
    return q(
      `SELECT s.store_id AS "storeId", s.name AS "storeName", COUNT(DISTINCT so.order_id)::int AS orders,
              COALESCE(SUM(c.cups), 0)::int AS cups, COUNT(DISTINCT so.member_id)::int AS customers,
              COALESCE(SUM(so.total_amount), 0) AS sales, ROUND(AVG(so.total_amount), 0) AS "avgTicket",
              COALESCE(SUM(so.discount_amount), 0) AS discounts, COALESCE(SUM(so.points_used), 0)::int AS "pointsUsed"
       FROM sales_order so JOIN store s ON s.store_id = so.store_id
       JOIN LATERAL (SELECT SUM(quantity) AS cups FROM order_item oi WHERE oi.order_id = so.order_id) c ON true
       WHERE ${WHERE}
       GROUP BY s.store_id, s.name ORDER BY sales DESC`, args(r, u))
  }
  if (by !== 'product') throw bad('統計方式須為 product 或 store')
  return q(
    `SELECT ol.product_id AS "productId", MAX(ol.product_name) AS name, c.name AS category,
            SUM(ol.quantity)::int AS qty, COUNT(DISTINCT so.order_id)::int AS orders,
            COUNT(DISTINCT so.member_id)::int AS buyers, SUM(ol.line_total) AS revenue
     FROM sales_order so JOIN order_line ol ON ol.order_id = so.order_id
     JOIN product p ON p.product_id = ol.product_id JOIN category c ON c.category_id = p.category_id
     WHERE ${WHERE}
     GROUP BY ol.product_id, c.name ORDER BY qty DESC, ol.product_id`, args(r, u))
}

/** SRS-F-004: sales by hour of day (every hour 0-23 appears, empty or not). */
export function byHour(u: SessionUser, r: Range) {
  return q(
    `SELECT h AS hour, COALESCE(x.orders, 0)::int AS orders, COALESCE(x.sales, 0) AS sales, COALESCE(x.cups, 0)::int AS cups
     FROM generate_series(0, 23) AS h
     LEFT JOIN (
       SELECT extract(hour FROM so.local_time)::int AS hr, COUNT(*) AS orders, SUM(so.total_amount) AS sales,
              SUM((SELECT SUM(quantity) FROM order_item oi WHERE oi.order_id = so.order_id)) AS cups
       FROM sales_order so WHERE ${WHERE} GROUP BY 1) x ON x.hr = h
     ORDER BY h`, args(r, u))
}

/** SRS-F-004: sales by category, with each category's share of cups sold. */
export function byCategory(u: SessionUser, r: Range) {
  return q(
    `SELECT c.category_id AS "categoryId", c.name, COALESCE(SUM(ol.quantity), 0)::int AS qty, COALESCE(SUM(ol.line_total), 0) AS revenue,
            ROUND(100.0 * COALESCE(SUM(ol.quantity), 0) / NULLIF(SUM(SUM(ol.quantity)) OVER (), 0), 1) AS share
     FROM category c
     LEFT JOIN product p ON p.category_id = c.category_id
     LEFT JOIN (SELECT ol.* FROM sales_order so JOIN order_line ol ON ol.order_id = so.order_id WHERE ${WHERE}) ol
       ON ol.product_id = p.product_id
     GROUP BY c.category_id, c.name ORDER BY qty DESC`, args(r, u))
}

/** Headline numbers for the dashboard tiles. */
export async function summary(u: SessionUser, r: Range) {
  const rows = await q(
    `SELECT COUNT(*)::int AS orders, COALESCE(SUM(total_amount), 0) AS sales, ROUND(COALESCE(AVG(total_amount), 0), 0) AS "avgTicket",
            COUNT(DISTINCT member_id)::int AS customers,
            COALESCE(SUM((SELECT SUM(quantity) FROM order_item oi WHERE oi.order_id = so.order_id)), 0)::int AS cups
     FROM sales_order so WHERE ${WHERE}`, args(r, u))
  return rows[0]
}

// ─── CSV export (SRS-F-005) ─────────────────────────────────────────────────

export type Column = [key: string, header: string]

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v)
  // quote when needed; a leading = + - @ is neutralised so spreadsheets don't run it as a formula
  const safe = /^[=+\-@]/.test(s) && !/^-?\d/.test(s) ? `'${s}` : s
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** UTF-8 with a BOM so Excel opens the Chinese headers correctly. */
export function toCsv(columns: Column[], rows: Record<string, unknown>[]): string {
  const lines = [columns.map(([, h]) => cell(h)).join(','), ...rows.map((r) => columns.map(([k]) => cell(r[k])).join(','))]
  return '﻿' + lines.join('\r\n') + '\r\n'
}

export const COLUMNS: Record<string, Column[]> = {
  sales: [['period', '日期'], ['storeName', '門市名稱'], ['orders', '訂單數'], ['sales', '總銷售額'], ['avgTicket', '平均客單價']],
  'best-sellers': [['storeName', '門市'], ['rank', '名次'], ['name', '商品'], ['qty', '杯數'], ['revenue', '商品營收']],
  'purchases-product': [['name', '商品'], ['category', '分類'], ['qty', '杯數'], ['orders', '訂單數'], ['buyers', '購買人數'], ['revenue', '商品營收']],
  'purchases-store': [['storeName', '門市'], ['orders', '訂單數'], ['cups', '杯數'], ['customers', '顧客數'], ['sales', '總銷售額'], ['avgTicket', '平均客單價'], ['discounts', '折扣金額'], ['pointsUsed', '點數折抵']],
  hourly: [['hour', '時段（時）'], ['orders', '訂單數'], ['cups', '杯數'], ['sales', '總銷售額']],
  category: [['name', '分類'], ['qty', '杯數'], ['share', '杯數占比 %'], ['revenue', '商品營收']],
}
