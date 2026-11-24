import bcrypt from 'bcryptjs'
import type { Context } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { createMiddleware } from 'hono/factory'
import { SignJWT, jwtVerify } from 'jose'
import { one } from './db.ts'
import { env } from './env.ts'
import { forbidden, unauthorized } from './errors.ts'

export type Role = 'customer' | 'staff' | 'admin'

export interface SessionUser {
  userId: number
  loginId: string
  name: string
  email: string
  address: string | null
  status: number
  roles: Role[]
  memberId: number | null
  pointsBalance: number
  storeIds: number[] // stores this user may run (staff); admins may run every store
  emailVerified: boolean
}

export type AppEnv = { Variables: { user: SessionUser | null } }

const COOKIE = 'tehcha_session'
const MAX_AGE = 60 * 60 * 24 * 7

// UMS-N-001: bcrypt, never plain text.
export const hashPassword = (pw: string) => bcrypt.hash(pw, 10)
export const checkPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash)

export async function signToken(payload: Record<string, unknown>, expires: string): Promise<string> {
  return new SignJWT(payload).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(expires).sign(env.jwtSecret)
}

export async function readToken<T = Record<string, unknown>>(token: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, env.jwtSecret, { algorithms: ['HS256'] })
    return payload as T
  } catch {
    return null
  }
}

export async function startSession(c: Context, userId: number) {
  const token = await signToken({ sub: String(userId), kind: 'session' }, `${MAX_AGE}s`)
  setCookie(c, COOKIE, token, {
    httpOnly: true, secure: env.isProduction, sameSite: 'Lax', path: '/', maxAge: MAX_AGE,
  })
}

export function endSession(c: Context) {
  deleteCookie(c, COOKIE, { path: '/', secure: env.isProduction })
}

export async function loadUser(userId: number): Promise<SessionUser | undefined> {
  return one<SessionUser>(
    `SELECT u.user_id AS "userId", u.login_id AS "loginId", u.name, u.email, u.address, u.status,
            u.email_verified_at IS NOT NULL AS "emailVerified",
            COALESCE((SELECT array_agg(role ORDER BY role) FROM user_role r WHERE r.user_id = u.user_id), '{}') AS roles,
            m.member_id AS "memberId", COALESCE(m.points_balance, 0) AS "pointsBalance",
            CASE WHEN EXISTS (SELECT 1 FROM user_role r WHERE r.user_id = u.user_id AND r.role = 'admin')
                 THEN (SELECT COALESCE(array_agg(store_id ORDER BY store_id), '{}') FROM store)
                 ELSE (SELECT COALESCE(array_agg(store_id ORDER BY store_id), '{}') FROM store_staff s WHERE s.user_id = u.user_id)
            END AS "storeIds"
     FROM users u
     LEFT JOIN member m ON m.user_id = u.user_id
     WHERE u.user_id = $1`,
    [userId],
  )
}

/** Attaches the signed-in user (or null) to every request. Suspended or disabled accounts are signed out. */
export const session = createMiddleware<AppEnv>(async (c, next) => {
  c.set('user', null)
  const token = getCookie(c, COOKIE)
  if (token) {
    const payload = await readToken<{ sub?: string; kind?: string }>(token)
    const id = payload?.kind === 'session' ? Number(payload.sub) : NaN
    const user = Number.isInteger(id) ? await loadUser(id) : undefined
    if (user && user.status === 0) c.set('user', user)
    else endSession(c)
  }
  await next()
})

export function currentUser(c: Context<AppEnv>): SessionUser {
  const u = c.get('user')
  if (!u) throw unauthorized()
  return u
}

export const hasRole = (u: SessionUser | null, ...roles: Role[]) => !!u && roles.some((r) => u.roles.includes(r))

/** UMS-N-002: every protected route names the roles that may call it. */
export const requireRole = (...roles: Role[]) =>
  createMiddleware<AppEnv>(async (c, next) => {
    const u = c.get('user')
    if (!u) throw unauthorized()
    if (!hasRole(u, ...roles)) throw forbidden()
    await next()
  })

export function customerOf(c: Context<AppEnv>): SessionUser & { memberId: number } {
  const u = currentUser(c)
  if (!u.roles.includes('customer') || !u.memberId) throw forbidden('此功能僅限顧客會員使用')
  return u as SessionUser & { memberId: number }
}

/** BR-008: staff act only on their own stores; admins on all. */
export function assertStore(u: SessionUser, storeId: number) {
  if (!u.storeIds.includes(storeId)) throw forbidden('你不是這間門市的店員')
}
