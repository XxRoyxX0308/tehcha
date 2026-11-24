// UMS 會員與權限管理子系統 (UMS-F-001..007, UMS-N-001..003)
import { z } from 'zod'
import { checkPassword, hashPassword, loadUser, readToken, signToken, type Role, type SessionUser } from '../auth.ts'
import { one, q, tx, type Db } from '../db.ts'
import { env } from '../env.ts'
import { AppError, bad, conflict, forbidden, notFound, parse } from '../errors.ts'
import { mailEnabled, sendMail } from '../mail.ts'

const LOCK_AFTER = 5 // UMS-N-003
const LOCK_MINUTES = 15

export const loginIdSchema = z.string().trim().regex(/^[A-Za-z0-9_.-]{3,30}$/, '登入帳號須為 3 至 30 個英數字、底線、點或連字號')
export const passwordSchema = z.string().min(8, '密碼至少 8 個字元').max(72, '密碼最多 72 個字元')
const nameSchema = z.string().trim().min(1, '請填寫姓名').max(50, '姓名最多 50 字')
const emailSchema = z.string().trim().max(100).regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'E-mail 格式不正確')
const addressSchema = z.string().trim().max(200, '地址最多 200 字')

const registerSchema = z.object({
  loginId: loginIdSchema,
  name: nameSchema,
  password: passwordSchema,
  email: emailSchema,
  address: addressSchema.min(1, '請填寫地址'),
})

/** UMS-F-001: self-registration creates a customer with a points account. */
export async function register(input: unknown): Promise<{ userId: number; needsVerification: boolean }> {
  const d = parse(registerSchema, input)
  const hash = await hashPassword(d.password)
  const needsVerification = mailEnabled()
  const userId = await tx(async (c) => {
    const u = await one<{ user_id: number }>(
      `INSERT INTO users (login_id, name, password_hash, email, address, email_verified_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $6::boolean THEN NULL ELSE now() END) RETURNING user_id`,
      [d.loginId, d.name, hash, d.email, d.address, needsVerification], c)
    await q(`INSERT INTO user_role (user_id, role) VALUES ($1, 'customer')`, [u!.user_id], c)
    await q(`INSERT INTO member (user_id) VALUES ($1)`, [u!.user_id], c)
    return u!.user_id
  })
  if (needsVerification) await sendVerification(userId, d.email, d.name)
  return { userId, needsVerification }
}

async function sendVerification(userId: number, email: string, name: string) {
  const token = await signToken({ sub: String(userId), kind: 'verify' }, '24h')
  const link = `${env.appUrl}/api/auth/verify?token=${encodeURIComponent(token)}`
  await sendMail(email, '得茶 Tehcha｜請確認你的 E-mail',
    `${name} 你好：\n\n請在 24 小時內點選下方連結啟用帳號：\n${link}\n\n若你沒有註冊得茶會員，請忽略這封信。`)
}

/** UMS-F-003: the link in the verification mail lands here. */
export async function verifyEmail(token: string): Promise<boolean> {
  const p = await readToken<{ sub?: string; kind?: string }>(token)
  if (p?.kind !== 'verify') return false
  const r = await q(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE user_id = $1 RETURNING user_id`, [Number(p.sub)])
  return r.length > 0
}

const loginSchema = z.object({ loginId: z.string().trim().min(1, '請輸入登入帳號'), password: z.string().min(1, '請輸入密碼') })

/** UMS-F-002 with the lockout of UMS-N-003: five wrong passwords lock the account for 15 minutes. */
export async function login(input: unknown): Promise<number> {
  const d = parse(loginSchema, input)
  const u = await one<{ user_id: number; password_hash: string; status: number; locked_until: Date | null; verified: boolean }>(
    `SELECT user_id, password_hash, status, locked_until, email_verified_at IS NOT NULL AS verified
     FROM users WHERE login_id = $1`, [d.loginId])
  if (!u) throw new AppError(401, '帳號或密碼錯誤', 'bad_credentials')
  if (u.locked_until && u.locked_until > new Date()) {
    const mins = Math.ceil((u.locked_until.getTime() - Date.now()) / 60000)
    throw new AppError(423, `登入失敗次數過多，帳號已暫時鎖定，請 ${mins} 分鐘後再試`, 'locked')
  }
  if (!(await checkPassword(d.password, u.password_hash))) {
    const r = await one<{ failed_login_count: number; locked: boolean }>(
      `UPDATE users SET
         failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
         locked_until = CASE WHEN failed_login_count + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE NULL END
       WHERE user_id = $1
       RETURNING failed_login_count, locked_until IS NOT NULL AS locked`, [u.user_id, LOCK_AFTER, LOCK_MINUTES])
    if (r?.locked) throw new AppError(423, `密碼連續錯誤 ${LOCK_AFTER} 次，帳號已鎖定 ${LOCK_MINUTES} 分鐘`, 'locked')
    const left = LOCK_AFTER - (r?.failed_login_count ?? 0)
    throw new AppError(401, `帳號或密碼錯誤（再錯 ${left} 次將暫時鎖定）`, 'bad_credentials')
  }
  if (u.status === 1) throw forbidden('此帳號已停權，請聯絡門市')
  if (u.status === 2) throw forbidden('此帳號已停用')
  if (!u.verified && mailEnabled()) throw new AppError(403, '請先點選驗證信中的連結啟用帳號', 'unverified')
  await q(`UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE user_id = $1`, [u.user_id])
  return u.user_id
}

export async function me(user: SessionUser) {
  const warnings = await q(
    `SELECT reason, created_at AS "createdAt" FROM user_warning WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5`, [user.userId])
  return { ...user, warnings }
}

const profileSchema = z.object({ name: nameSchema, email: emailSchema, address: addressSchema })

/** UMS-F-004 */
export async function updateProfile(userId: number, input: unknown) {
  const d = parse(profileSchema, input)
  await q(`UPDATE users SET name = $2, email = $3, address = NULLIF($4, '') WHERE user_id = $1`, [userId, d.name, d.email, d.address])
}

const passwordChangeSchema = z.object({ oldPassword: z.string().min(1, '請輸入目前的密碼'), newPassword: passwordSchema })

export async function changePassword(userId: number, input: unknown) {
  const d = parse(passwordChangeSchema, input)
  const u = await one<{ password_hash: string }>(`SELECT password_hash FROM users WHERE user_id = $1`, [userId])
  if (!u || !(await checkPassword(d.oldPassword, u.password_hash))) throw bad('目前的密碼不正確')
  await q(`UPDATE users SET password_hash = $2 WHERE user_id = $1`, [userId, await hashPassword(d.newPassword)])
}

// ─── Admin: accounts and roles (UMS-F-005, UMS-F-006, AUI-001) ───────────────

const roleSchema = z.enum(['customer', 'staff', 'admin'])

export async function listUsers(params: { q?: string; role?: string }) {
  const term = params.q?.trim() ? `%${params.q.trim().replace(/[\\%_]/g, (m) => '\\' + m)}%` : null
  const role = params.role && roleSchema.safeParse(params.role).success ? params.role : null
  return q(
    `SELECT u.user_id AS "userId", u.login_id AS "loginId", u.name, u.email, u.address, u.status,
            u.created_at AS "createdAt", u.locked_until > now() AS locked,
            COALESCE((SELECT array_agg(role ORDER BY role) FROM user_role r WHERE r.user_id = u.user_id), '{}') AS roles,
            COALESCE((SELECT array_agg(store_id ORDER BY store_id) FROM store_staff s WHERE s.user_id = u.user_id), '{}') AS "storeIds",
            m.member_id AS "memberId", m.points_balance AS "pointsBalance",
            (SELECT count(*) FROM orders o WHERE o.member_id = m.member_id) AS "orderCount",
            (SELECT count(*) FROM user_warning w WHERE w.user_id = u.user_id) AS "warningCount"
     FROM users u LEFT JOIN member m ON m.user_id = u.user_id
     WHERE ($1::text IS NULL OR u.login_id ILIKE $1 OR u.name ILIKE $1 OR u.email ILIKE $1)
       AND ($2::text IS NULL OR EXISTS (SELECT 1 FROM user_role r WHERE r.user_id = u.user_id AND r.role = $2))
     ORDER BY u.user_id`,
    [term, role])
}

/** Member details for the admin: points ledger, recent orders and warnings. */
export async function userDetail(userId: number) {
  const user = await one(`SELECT user_id AS "userId", login_id AS "loginId", name FROM users WHERE user_id = $1`, [userId])
  if (!user) throw notFound('找不到使用者')
  const [points, orders, warnings] = await Promise.all([
    q(`SELECT p.log_id AS id, p.order_id AS "orderId", p.points_change AS change, p.reason, p.created_at AS "createdAt"
       FROM point_log p JOIN member m USING (member_id) WHERE m.user_id = $1 ORDER BY p.log_id DESC LIMIT 30`, [userId]),
    q(`SELECT o.order_id AS id, o.order_time AS "orderTime", s.name AS "storeName", o.status, o.total_amount AS "totalAmount"
       FROM orders o JOIN member m USING (member_id) JOIN store s USING (store_id)
       WHERE m.user_id = $1 ORDER BY o.order_time DESC LIMIT 20`, [userId]),
    q(`SELECT w.warning_id AS id, w.reason, w.created_at AS "createdAt", i.name AS "issuedBy"
       FROM user_warning w LEFT JOIN users i ON i.user_id = w.issued_by WHERE w.user_id = $1 ORDER BY w.created_at DESC`, [userId]),
  ])
  return { ...user, points, orders, warnings }
}

const adminUserSchema = z.object({
  loginId: loginIdSchema,
  name: nameSchema,
  email: emailSchema,
  address: addressSchema.optional().default(''),
  password: passwordSchema,
  roles: z.array(roleSchema).min(1, '至少指定一個角色'),
  storeIds: z.array(z.number().int().positive()).default([]),
})

const adminUpdateSchema = adminUserSchema.omit({ loginId: true, password: true }).extend({
  password: passwordSchema.optional().or(z.literal('').transform(() => undefined)),
})

async function setRolesAndStores(c: Db, userId: number, roles: Role[], storeIds: number[]) {
  await q(`DELETE FROM user_role WHERE user_id = $1`, [userId], c)
  await q(`INSERT INTO user_role (user_id, role) SELECT $1, unnest($2::text[])`, [userId, [...new Set(roles)]], c)
  if (roles.includes('customer')) await q(`INSERT INTO member (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`, [userId], c)
  await q(`DELETE FROM store_staff WHERE user_id = $1`, [userId], c)
  if (roles.includes('staff') && storeIds.length) {
    await q(`INSERT INTO store_staff (store_id, user_id) SELECT unnest($2::int[]), $1`, [userId, [...new Set(storeIds)]], c)
  }
}

/** Admin creates an account and assigns its roles and stores (UMS-F-006, Scenario 3). */
export async function createUser(input: unknown) {
  const d = parse(adminUserSchema, input)
  if (d.roles.includes('staff') && !d.storeIds.length) throw bad('店員須指派至少一間門市')
  const hash = await hashPassword(d.password)
  return tx(async (c) => {
    const u = await one<{ user_id: number }>(
      `INSERT INTO users (login_id, name, password_hash, email, address, email_verified_at)
       VALUES ($1, $2, $3, $4, NULLIF($5, ''), now()) RETURNING user_id`, [d.loginId, d.name, hash, d.email, d.address], c)
    await setRolesAndStores(c, u!.user_id, d.roles, d.storeIds)
    return { userId: u!.user_id }
  })
}

export async function updateUser(admin: SessionUser, userId: number, input: unknown) {
  const d = parse(adminUpdateSchema, input)
  if (d.roles.includes('staff') && !d.storeIds.length) throw bad('店員須指派至少一間門市')
  if (userId === admin.userId && !d.roles.includes('admin')) throw conflict('不能移除自己的管理員權限')
  await tx(async (c) => {
    const r = await q(`UPDATE users SET name = $2, email = $3, address = NULLIF($4, '') WHERE user_id = $1 RETURNING user_id`,
      [userId, d.name, d.email, d.address], c)
    if (!r.length) throw notFound('找不到使用者')
    if (d.password) await q(`UPDATE users SET password_hash = $2 WHERE user_id = $1`, [userId, await hashPassword(d.password)], c)
    await setRolesAndStores(c, userId, d.roles, d.storeIds)
  })
}

const statusSchema = z.object({ status: z.union([z.literal(0), z.literal(1), z.literal(2)]) })

/** 0 restore, 1 suspend (停權), 2 disable (停用). Accounts are never deleted (UMS-F-007). */
export async function setStatus(admin: SessionUser, userId: number, input: unknown) {
  const { status } = parse(statusSchema, input)
  if (userId === admin.userId && status !== 0) throw conflict('不能停用自己的帳號')
  const r = await q(`UPDATE users SET status = $2, failed_login_count = 0, locked_until = NULL WHERE user_id = $1 RETURNING user_id`, [userId, status])
  if (!r.length) throw notFound('找不到使用者')
}

const warnSchema = z.object({ reason: z.string().trim().min(2, '請填寫警告原因').max(200) })

export async function warnUser(admin: SessionUser, userId: number, input: unknown) {
  const { reason } = parse(warnSchema, input)
  const exists = await one(`SELECT 1 FROM users WHERE user_id = $1`, [userId])
  if (!exists) throw notFound('找不到使用者')
  await q(`INSERT INTO user_warning (user_id, issued_by, reason) VALUES ($1, $2, $3)`, [userId, admin.userId, reason])
}

export { loadUser }
