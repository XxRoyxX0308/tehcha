// Starts a throwaway PostgreSQL 17 (or uses TEST_DATABASE_URL), then builds the schema and sample data.
import os from 'node:os'
import path from 'node:path'
import type { GlobalSetupContext } from 'vitest/node'
import { migrate } from '../scripts/migrate.mjs'

export default async function setup({ provide }: GlobalSetupContext) {
  let url = process.env.TEST_DATABASE_URL
  let stop: (() => Promise<void>) | undefined
  if (!url) {
    const { startDevDb } = await import('../devdb/start.mjs')
    const db = await startDevDb({ port: 54340, dataDir: path.join(os.tmpdir(), 'tehcha-test-pg'), database: 'tehcha_test', fresh: true })
    url = db.url
    stop = db.stop
  }
  await migrate(url, { reset: true, seed: true, log: () => {} })
  provide('databaseUrl', url)
  return async () => { await stop?.() }
}

declare module 'vitest' {
  export interface ProvidedContext { databaseUrl: string }
}
