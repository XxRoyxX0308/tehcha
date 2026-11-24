// Database setup in one command (IR-001).
//
//   node backend/scripts/migrate.mjs                  apply new migrations
//   node backend/scripts/migrate.mjs --seed           ...then load the sample data
//   node backend/scripts/migrate.mjs --seed-if-empty  ...load it only into an empty database (Vercel build)
//   node backend/scripts/migrate.mjs --reset --seed   drop everything first (local only)
//   --skip-without-db                                 exit quietly when DATABASE_URL is not set
//
// Reads DATABASE_URL_UNPOOLED, else DATABASE_URL (the names the Neon integration sets on Vercel),
// from the environment or the repo's .env file.
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '../..')
const dbDir = path.resolve(here, '../db')
const args = new Set(process.argv.slice(2))

/** Same adjustment as backend/src/db.ts: drop channel_binding, spell out sslmode=verify-full. */
function cleanUrl(url) {
  try {
    const u = new URL(url)
    u.searchParams.delete('channel_binding')
    if (u.searchParams.get('sslmode') === 'require') u.searchParams.set('sslmode', 'verify-full')
    return u.toString()
  } catch {
    return url
  }
}

export async function migrate(connectionString, { reset = false, seed = false, seedIfEmpty = false, log = console.log } = {}) {
  const client = new pg.Client({ connectionString: cleanUrl(connectionString) })
  await client.connect()
  try {
    if (reset) {
      if (/neon\.tech/.test(connectionString) && !process.env.ALLOW_REMOTE_RESET) {
        throw new Error('refusing to --reset a Neon database; set ALLOW_REMOTE_RESET=1 if you mean it')
      }
      await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
      log('migrate: dropped all tables')
    }
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
    // One deploy at a time: concurrent builds wait here instead of racing.
    await client.query('SELECT pg_advisory_lock(424242)')
    const done = new Set((await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name))
    const files = readdirSync(path.join(dbDir, 'migrations')).filter((f) => f.endsWith('.sql')).sort()
    for (const f of files) {
      if (done.has(f)) continue
      const sql = readFileSync(path.join(dbDir, 'migrations', f), 'utf8')
      await client.query('BEGIN')
      try {
        await client.query(sql)
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f])
        await client.query('COMMIT')
        log(`migrate: applied ${f}`)
      } catch (e) {
        await client.query('ROLLBACK')
        throw new Error(`${f}: ${e.message}`)
      }
    }
    let doSeed = seed
    if (!doSeed && seedIfEmpty) {
      const { rows } = await client.query('SELECT count(*)::int AS n FROM users')
      doSeed = rows[0].n === 0
      if (!doSeed) log('migrate: database already has data, not seeding')
    }
    if (doSeed) {
      await client.query(readFileSync(path.join(dbDir, 'seed.sql'), 'utf8'))
      const { rows } = await client.query('SELECT (SELECT count(*) FROM orders)::int AS orders, (SELECT count(*) FROM users)::int AS users')
      log(`migrate: seeded ${rows[0].users} users and ${rows[0].orders} orders`)
    }
    await client.query('SELECT pg_advisory_unlock(424242)')
  } finally {
    await client.end()
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.loadEnvFile(path.join(root, '.env')) } catch { /* no .env: use the environment */ }
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) {
    if (args.has('--skip-without-db')) {
      console.log('migrate: DATABASE_URL is not set, skipping database setup')
      process.exit(0)
    }
    console.error('migrate: set DATABASE_URL (see .env.example)')
    process.exit(1)
  }
  migrate(url, { reset: args.has('--reset'), seed: args.has('--seed'), seedIfEmpty: args.has('--seed-if-empty') })
    .catch((e) => { console.error('migrate failed:', e.message); process.exit(1) })
}
