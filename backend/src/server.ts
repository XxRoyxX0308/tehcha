// Local development server: http://localhost:8787/api (the Vite dev server proxies /api here).
import { serve } from '@hono/node-server'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
try { process.loadEnvFile(path.join(root, '.env')) } catch { /* use the environment */ }

const { app } = await import('./app.ts')
const port = Number(process.env.API_PORT) || 8787
serve({ fetch: app.fetch, port }, () => console.log(`API ready on http://localhost:${port}/api`))
