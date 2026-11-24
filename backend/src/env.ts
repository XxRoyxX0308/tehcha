import { createHash } from 'node:crypto'

// All configuration comes from the environment (IR-002, see .env.example at the repo root).
// Read lazily so tests and scripts can set variables before first use.
export const env = {
  get databaseUrl(): string {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL || ''
    if (!url) throw new Error('DATABASE_URL is not set')
    return url
  },
  get isProduction(): boolean {
    return process.env.NODE_ENV === 'production' || !!process.env.VERCEL
  },
  /** Signs session cookies. Falls back to a value derived from the database URL so a fresh
   *  Vercel + Neon deploy works before JWT_SECRET is set; set it explicitly in production. */
  get jwtSecret(): Uint8Array {
    const s = process.env.JWT_SECRET || createHash('sha256').update(`tehcha-session:${env.databaseUrl}`).digest('hex')
    return new TextEncoder().encode(s)
  },
  get appUrl(): string {
    if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '')
    if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`
    return 'http://localhost:5173'
  },
  get cronSecret(): string | undefined {
    return process.env.CRON_SECRET || undefined
  },
  get dbPoolMax(): number {
    return Number(process.env.DB_POOL_MAX) || 5
  },
  mail: {
    get enabled(): boolean { return !!process.env.MAIL_HOST },
    get host() { return process.env.MAIL_HOST ?? '' },
    get port() { return Number(process.env.MAIL_PORT) || 587 },
    get user() { return process.env.MAIL_USER ?? '' },
    get pass() { return process.env.MAIL_PASSWORD ?? '' },
    get from() { return process.env.MAIL_FROM || '得茶 Tehcha <no-reply@tehcha.example>' },
  },
}
