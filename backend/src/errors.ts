import { z } from 'zod'

export class AppError extends Error {
  constructor(public status: number, message: string, public code = 'error', public extra?: Record<string, unknown>) {
    super(message)
  }
}

export const bad = (msg: string, code = 'invalid') => new AppError(400, msg, code)
export const notFound = (msg = '找不到資料') => new AppError(404, msg, 'not_found')
export const conflict = (msg: string, code = 'conflict') => new AppError(409, msg, code)
export const forbidden = (msg = '沒有權限執行此操作') => new AppError(403, msg, 'forbidden')
export const unauthorized = (msg = '請先登入') => new AppError(401, msg, 'unauthorized')

/** Validates input with a zod schema; the first problem becomes a 400 with a readable message. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data)
  if (r.success) return r.data
  const issue = r.error.issues[0]
  const where = issue?.path?.length ? `${issue.path.join('.')}：` : ''
  throw bad(`${where}${issue?.message ?? '資料格式不正確'}`)
}

const UNIQUE: Record<string, string> = {
  users_login_id_key: '此登入帳號已被使用',
  store_name_key: '門市名稱已存在',
  category_name_key: '分類名稱已存在',
  custom_option_type_name_key: '同類型已有相同名稱的選項',
  review_order_id_key: '此訂單已評論過',
  point_log_once_per_order_uq: '此訂單的點數已處理過',
  discount_pkey: '折扣代碼重複，請再試一次',
  orders_pickup_no_uq: '取餐編號衝突，請再試一次',
}

const CHECKS: Record<string, string> = {
  member_points_balance_check: '點數不足',
  store_product_stock_qty_check: '庫存不足',
  users_login_id_check: '登入帳號須為 3 至 30 個英數字、底線、點或連字號',
  users_email_check: 'E-mail 格式不正確',
  discount_check: '折扣結束日期不可早於開始日期',
}

interface PgError { code?: string; constraint?: string; hint?: string; detail?: string; message: string }

/** Turns database errors into HTTP errors with messages a user can act on. */
export function fromPgError(e: unknown): AppError | null {
  const err = e as PgError
  if (!err || typeof err.code !== 'string' || err.code.length !== 5) return null
  switch (err.code) {
    case '23505':
      return conflict(UNIQUE[err.constraint ?? ''] ?? '資料重複')
    case '23503':
      return conflict('資料仍被其他紀錄使用，或參照的資料不存在')
    case '23514':
      if (err.hint === 'status_transition') return conflict('訂單狀態只能依序前進，請重新整理後再試', 'status_transition')
      if (err.hint === 'review_not_closed') return conflict('訂單結案後才能評論')
      if (err.message.includes('amounts are final')) return conflict('訂單金額成立後不可更改')
      return bad(CHECKS[err.constraint ?? ''] ?? '資料不符合限制條件', 'constraint')
    case '23P01':
      if (err.hint === 'special_event_overlap')
        return conflict(`同一商品的特殊活動期間不可重疊（與 ${err.detail} 衝突）`, 'special_event_overlap')
      return conflict('資料與現有紀錄衝突')
    case '22P02':
    case '22007':
    case '22008':
      return bad('資料格式不正確')
    case '40001':
    case '40P01':
      return conflict('系統忙碌，請再試一次', 'retry')
    default:
      return null
  }
}
