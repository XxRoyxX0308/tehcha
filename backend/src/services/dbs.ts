// DBS 資料庫子系統: backup and restore (DBS-F-002, DBS-N-002, AUI-002), integrity checks
// (Scenario 3) and the maintenance switch (BMS-N-005).
//
// Backups are logical: every table as JSON, gzipped, kept in backup_snapshot. Neon's own
// point-in-time restore still covers the database as a whole.
import { gunzipSync, gzipSync } from 'node:zlib'
import { z } from 'zod'
import { getPool, one, q, tx } from '../db.ts'
import { bad, notFound, parse } from '../errors.ts'

/** Parents before children, so a restore can insert in this order. */
export const TABLES: { name: string; serial?: string }[] = [
  { name: 'users', serial: 'user_id' },
  { name: 'user_role' },
  { name: 'member', serial: 'member_id' },
  { name: 'user_warning', serial: 'warning_id' },
  { name: 'store', serial: 'store_id' },
  { name: 'store_staff' },
  { name: 'category', serial: 'category_id' },
  { name: 'product', serial: 'product_id' },
  { name: 'store_product' },
  { name: 'custom_option', serial: 'option_id' },
  { name: 'product_option' },
  { name: 'discount' },
  { name: 'discount_product' },
  { name: 'orders', serial: 'order_id' },
  { name: 'order_item', serial: 'order_item_id' },
  { name: 'order_item_option' },
  { name: 'order_discount' },
  { name: 'order_status_log' },
  { name: 'point_log', serial: 'log_id' },
  { name: 'review', serial: 'review_id' },
  { name: 'cart_item', serial: 'cart_item_id' },
  { name: 'cart_item_option' },
]
const NAMES = new Set(TABLES.map((t) => t.name))
const FORMAT = 'tehcha-backup/1'

interface Dump { format: string; createdAt: string; tables: Record<string, Record<string, unknown>[]> }

async function dump(): Promise<Dump> {
  // one snapshot-consistent read of every table
  const c = await getPool().connect()
  try {
    await c.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const tables: Dump['tables'] = {}
    for (const t of TABLES) {
      const order = t.serial ?? '1'
      tables[t.name] = (await c.query(`SELECT * FROM ${t.name} ORDER BY ${order}`)).rows
    }
    await c.query('COMMIT')
    return { format: FORMAT, createdAt: new Date().toISOString(), tables }
  } finally {
    c.release()
  }
}

export async function createBackup(kind: 'auto' | 'manual' | 'pre-restore', by: string | null) {
  const data = await dump()
  const payload = gzipSync(Buffer.from(JSON.stringify(data)))
  const rowCounts = Object.fromEntries(Object.entries(data.tables).map(([k, v]) => [k, v.length]))
  const row = await one(
    `INSERT INTO backup_snapshot (kind, created_by, size_bytes, row_counts, payload) VALUES ($1, $2, $3, $4, $5)
     RETURNING backup_id AS id, kind, created_at AS "createdAt", created_by AS "createdBy", size_bytes AS "sizeBytes", row_counts AS "rowCounts"`,
    [kind, by, payload.length, JSON.stringify(rowCounts), payload])
  // DBS-N-002: keep 30 days of backups
  await q(`DELETE FROM backup_snapshot WHERE created_at < now() - interval '30 days'`)
  return row
}

/** The daily job: at most one automatic backup per 20 hours, however often the cron fires. */
export async function dailyBackup() {
  const recent = await one(`SELECT 1 FROM backup_snapshot WHERE kind = 'auto' AND created_at > now() - interval '20 hours'`)
  if (recent) return { skipped: true }
  return { skipped: false, backup: await createBackup('auto', 'cron') }
}

export const listBackups = () =>
  q(`SELECT backup_id AS id, kind, created_at AS "createdAt", created_by AS "createdBy", size_bytes AS "sizeBytes", row_counts AS "rowCounts"
     FROM backup_snapshot ORDER BY created_at DESC`)

export async function backupFile(id: number) {
  const r = await one<{ payload: Buffer; createdAt: Date }>(`SELECT payload, created_at AS "createdAt" FROM backup_snapshot WHERE backup_id = $1`, [id])
  if (!r) throw notFound('找不到備份')
  return r
}

export async function deleteBackup(id: number) {
  const r = await q(`DELETE FROM backup_snapshot WHERE backup_id = $1 RETURNING backup_id`, [id])
  if (!r.length) throw notFound('找不到備份')
}

function decode(buf: Buffer): Dump {
  let data: Dump
  try {
    const raw = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf
    data = JSON.parse(raw.toString('utf8'))
  } catch {
    throw bad('備份檔無法讀取，請選擇本系統匯出的 .json.gz 檔')
  }
  if (data?.format !== FORMAT || typeof data.tables !== 'object') throw bad('這不是得茶系統的備份檔')
  for (const name of Object.keys(data.tables)) if (!NAMES.has(name)) throw bad(`備份檔含有未知的資料表 ${name}`)
  if (!data.tables.users?.length) throw bad('備份檔沒有任何使用者，無法還原')
  return data
}

/** Replaces all business data with a backup. A 'pre-restore' backup is taken first, so a
 *  restore can itself be undone. Member balances are rebuilt from the points ledger (IC-005). */
export async function restore(buf: Buffer, by: string) {
  const data = decode(buf)
  await createBackup('pre-restore', by)
  await tx(async (c) => {
    await c.query(`TRUNCATE ${TABLES.map((t) => t.name).join(', ')} RESTART IDENTITY CASCADE`)
    for (const t of TABLES) {
      const rows = data.tables[t.name] ?? []
      if (!rows.length) continue
      const json = JSON.stringify(rows)
      if (t.name === 'member') {
        await c.query(`INSERT INTO member (member_id, user_id, points_balance)
                       SELECT member_id, user_id, 0 FROM json_populate_recordset(NULL::member, $1::json)`, [json])
      } else if (t.name === 'point_log') {
        // replayed in ledger order; the trigger adds each change to the balance
        await c.query(`INSERT INTO point_log SELECT * FROM json_populate_recordset(NULL::point_log, $1::json) ORDER BY log_id`, [json])
      } else {
        await c.query(`INSERT INTO ${t.name} SELECT * FROM json_populate_recordset(NULL::${t.name}, $1::json)`, [json])
      }
    }
    for (const t of TABLES.filter((x) => x.serial)) {
      await c.query(`SELECT setval(pg_get_serial_sequence('${t.name}', '${t.serial}'), COALESCE((SELECT MAX(${t.serial}) FROM ${t.name}), 0) + 1, false)`)
    }
  })
  return Object.fromEntries(Object.entries(data.tables).map(([k, v]) => [k, v.length]))
}

export async function restoreFromSnapshot(id: number, by: string) {
  const { payload } = await backupFile(id)
  return restore(payload, by)
}

// ─── Integrity checks (Scenario 3: 資料完整性檢查) ─────────────────────────

const CHECKS: { id: string; rule: string; sql: string }[] = [
  { id: 'IC-005', rule: '會員點數餘額等於點數紀錄總和',
    sql: `SELECT m.member_id AS key, m.points_balance AS value FROM member m
          WHERE m.points_balance <> (SELECT COALESCE(SUM(points_change), 0) FROM point_log p WHERE p.member_id = m.member_id)` },
  { id: 'BR-002', rule: '訂單總額 = 小計 + 稅 + 運費 − 折扣 − 點數，且不小於 0',
    sql: `SELECT order_id AS key, total_amount AS value FROM orders
          WHERE total_amount <> subtotal + tax + shipping_fee - discount_amount - points_used OR total_amount < 0` },
  { id: 'OCS-F-002', rule: '訂單小計等於各明細（含客製化加價）加總',
    sql: `SELECT o.order_id AS key, o.subtotal AS value FROM orders o
          WHERE o.subtotal <> (SELECT COALESCE(SUM(line_total), 0) FROM order_line ol WHERE ol.order_id = o.order_id)` },
  { id: 'DIS-F-006', rule: '訂單折扣總額等於各折扣明細加總',
    sql: `SELECT o.order_id AS key, o.discount_amount AS value FROM orders o
          WHERE o.discount_amount <> (SELECT COALESCE(SUM(amount), 0) FROM order_discount od WHERE od.order_id = o.order_id)` },
  { id: 'DIS-F-008', rule: '已結案訂單皆已發放點數（實付滿 NT$10）',
    sql: `SELECT o.order_id AS key, o.total_amount AS value FROM orders o
          WHERE o.status = 'closed' AND o.total_amount >= 10
            AND NOT EXISTS (SELECT 1 FROM point_log p WHERE p.order_id = o.order_id AND p.reason = 'earn')` },
  { id: 'BR-006', rule: '已取消訂單的折抵點數已退回',
    sql: `SELECT o.order_id AS key, o.points_used AS value FROM orders o
          WHERE o.status = 'cancelled' AND o.points_used > 0
            AND NOT EXISTS (SELECT 1 FROM point_log p WHERE p.order_id = o.order_id AND p.reason = 'refund')` },
  { id: 'IC-003', rule: '庫存、價格與加價皆不為負數',
    sql: `SELECT 'stock ' || store_id || '/' || product_id AS key, stock_qty AS value FROM store_product WHERE stock_qty < 0
          UNION ALL SELECT 'product ' || product_id, price FROM product WHERE price < 0
          UNION ALL SELECT 'option ' || option_id, extra_price FROM custom_option WHERE extra_price < 0` },
  { id: 'BR-011', rule: '同一商品的特殊活動期間不重疊',
    sql: `SELECT a.discount_code || ' × ' || b.discount_code AS key, a.product_id AS value
          FROM discount_product a JOIN discount_product b ON a.product_id = b.product_id AND a.discount_code < b.discount_code
          JOIN discount da ON da.discount_code = a.discount_code JOIN discount db ON db.discount_code = b.discount_code
          WHERE NOT da.is_deleted AND NOT db.is_deleted AND da.start_date <= db.end_date AND db.start_date <= da.end_date` },
  { id: 'BR-012', rule: '評論只出現在已結案訂單',
    sql: `SELECT r.review_id AS key, o.status AS value FROM review r JOIN orders o USING (order_id) WHERE o.status <> 'closed'` },
  { id: 'UMS-F-005', rule: '每個帳號至少有一個角色，顧客皆有會員點數帳戶',
    sql: `SELECT u.login_id AS key, 'no role' AS value FROM users u WHERE NOT EXISTS (SELECT 1 FROM user_role r WHERE r.user_id = u.user_id)
          UNION ALL SELECT u.login_id, 'no member' FROM users u JOIN user_role r ON r.user_id = u.user_id AND r.role = 'customer'
          WHERE NOT EXISTS (SELECT 1 FROM member m WHERE m.user_id = u.user_id)` },
  { id: 'BR-008', rule: '每位店員至少隸屬一間門市',
    sql: `SELECT u.login_id AS key, 'no store' AS value FROM users u JOIN user_role r ON r.user_id = u.user_id AND r.role = 'staff'
          WHERE u.status = 0 AND NOT EXISTS (SELECT 1 FROM store_staff s WHERE s.user_id = u.user_id)` },
  { id: 'OCS-F-003', rule: '每筆訂單的狀態紀錄與目前狀態一致',
    sql: `SELECT o.order_id AS key, o.status AS value FROM orders o
          WHERE NOT EXISTS (SELECT 1 FROM order_status_log l WHERE l.order_id = o.order_id AND l.status = o.status)` },
]

export async function integrityCheck() {
  const results = []
  for (const ch of CHECKS) {
    const rows = await q<{ key: string; value: unknown }>(`SELECT * FROM (${ch.sql}) x LIMIT 20`)
    results.push({ id: ch.id, rule: ch.rule, ok: rows.length === 0, samples: rows })
  }
  const counts = await one(`SELECT (SELECT count(*) FROM users) AS users, (SELECT count(*) FROM orders) AS orders,
                                    (SELECT count(*) FROM product) AS products, (SELECT count(*) FROM point_log) AS "pointLogs",
                                    pg_size_pretty(pg_database_size(current_database())) AS "dbSize"`)
  return { checkedAt: new Date().toISOString(), results, counts }
}

// ─── Maintenance switch (BMS-N-005) ─────────────────────────────────────────

export interface Maintenance { enabled: boolean; message: string }
let cache: { at: number; value: Maintenance } | null = null

export async function getMaintenance(fresh = false): Promise<Maintenance> {
  if (!fresh && cache && Date.now() - cache.at < 5000) return cache.value
  const r = await one<{ value: Maintenance }>(`SELECT value FROM app_setting WHERE key = 'maintenance'`)
  const value = { enabled: !!r?.value?.enabled, message: r?.value?.message ?? '' }
  cache = { at: Date.now(), value }
  return value
}

const maintenanceSchema = z.object({ enabled: z.boolean(), message: z.string().trim().max(200).optional().default('') })

export async function setMaintenance(input: unknown) {
  const d = parse(maintenanceSchema, input)
  await q(`INSERT INTO app_setting (key, value, updated_at) VALUES ('maintenance', $1, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(d)])
  cache = null
  return d
}
