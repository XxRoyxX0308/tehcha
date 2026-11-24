import { afterAll, inject } from 'vitest'
import { closePool } from '../src/db.ts'

process.env.DATABASE_URL = inject('databaseUrl')
process.env.JWT_SECRET = 'test-secret'
delete process.env.MAIL_HOST

afterAll(async () => { await closePool() })
