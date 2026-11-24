import pg from 'pg'
import { env } from './env.ts'

// NUMERIC money and COUNT(*) come back as numbers rather than strings.
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)) as unknown as string)
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => (v === null ? null : Number(v)) as unknown as string)
// DATE stays 'yyyy-mm-dd': turning it into a JS Date would shift it a day in non-UTC time zones.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v)

export type Db = pg.Pool | pg.PoolClient

let pool: pg.Pool | null = null
let poolUrl = ''

/** Neon's connection string, adjusted for node-postgres: it does not understand `channel_binding`,
 *  and it already treats `sslmode=require` as `verify-full` (saying so skips its deprecation warning). */
export function cleanUrl(url: string): string {
  try {
    const u = new URL(url)
    u.searchParams.delete('channel_binding')
    if (u.searchParams.get('sslmode') === 'require') u.searchParams.set('sslmode', 'verify-full')
    return u.toString()
  } catch {
    return url
  }
}

export function getPool(): pg.Pool {
  const url = env.databaseUrl
  if (!pool || poolUrl !== url) {
    void pool?.end().catch(() => {})
    poolUrl = url
    // One small pool per function instance; Neon's pooler (the -pooler host) multiplexes the rest.
    pool = new pg.Pool({
      connectionString: cleanUrl(url),
      max: env.dbPoolMax,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 10_000,
    })
    pool.on('error', () => { /* a dropped idle client is replaced on next use */ })
  }
  return pool
}

export async function closePool(): Promise<void> {
  const p = pool
  pool = null
  poolUrl = ''
  await p?.end()
}

/** Parameterised query (BMS-N-007): values never go into the SQL text. */
export async function q<T = Record<string, unknown>>(text: string, params: unknown[] = [], db: Db = getPool()): Promise<T[]> {
  const r = await db.query(text, params)
  return r.rows as T[]
}

export async function one<T = Record<string, unknown>>(text: string, params: unknown[] = [], db: Db = getPool()): Promise<T | undefined> {
  const r = await db.query(text, params)
  return r.rows[0] as T | undefined
}

/** Runs fn inside one transaction: every write commits together or none do (DBS-N-001). */
export async function tx<T>(fn: (c: pg.PoolClient) => Promise<T>): Promise<T> {
  const c = await getPool().connect()
  try {
    await c.query('BEGIN')
    const result = await fn(c)
    await c.query('COMMIT')
    return result
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    c.release()
  }
}
