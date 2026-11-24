// Vercel Function entry. vercel.json rewrites every /api/* request here; the Hono app routes it.
// Uses Vercel's Web-standard handler exports (Request in, Response out) on the Node.js runtime.
import { app } from '../backend/src/app.ts'

const handle = (request: Request) => app.fetch(request)

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
export const OPTIONS = handle
export const HEAD = handle
