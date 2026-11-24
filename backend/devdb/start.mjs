// Local PostgreSQL 17 for development and tests. Real server binaries (embedded-postgres),
// so transactions, triggers and row locks behave exactly as on Neon.
//
//   node backend/devdb/start.mjs            -> keeps a server running on :54329 (Ctrl+C to stop)
//   import { startDevDb } from './start.mjs' -> used by the test setup (throwaway data dir)
import EmbeddedPostgres from 'embedded-postgres'
import { existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const here = path.dirname(fileURLToPath(import.meta.url))

export async function startDevDb({ port = 54329, dataDir = path.join(here, 'data'), database = 'tehcha', fresh = false } = {}) {
  if (fresh && existsSync(dataDir)) rmSync(dataDir, { recursive: true, force: true })
  const server = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port,
    persistent: !fresh,
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  })
  if (!existsSync(path.join(dataDir, 'PG_VERSION'))) await server.initialise()
  await server.start()

  const admin = new pg.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: 'postgres' })
  await admin.connect()
  const { rowCount } = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [database])
  if (!rowCount) await admin.query(`CREATE DATABASE "${database}"`)
  await admin.end()

  return {
    url: `postgresql://postgres:postgres@127.0.0.1:${port}/${database}`,
    stop: () => server.stop(),
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const db = await startDevDb()
  console.log(`PostgreSQL 17 is running.\nDATABASE_URL=${db.url}\nPress Ctrl+C to stop.`)
  const stop = async () => { await db.stop(); process.exit(0) }
  process.on('SIGINT', stop)
  process.on('SIGTERM', stop)
}
