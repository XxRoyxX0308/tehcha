// RESTful JSON API (INT-001). Each subsystem lives in services/; this file maps URLs to them
// and states, per route, which roles may call it (UMS-N-002).
import { waitUntil } from '@vercel/functions'
import { Hono, type Context } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { secureHeaders } from 'hono/secure-headers'
import { customerOf, currentUser, endSession, hasRole, requireRole, session, startSession, type AppEnv } from './auth.ts'
import { q } from './db.ts'
import { env } from './env.ts'
import { AppError, bad, fromPgError } from './errors.ts'
import * as dbs from './services/dbs.ts'
import * as dis from './services/dis.ts'
import * as ocs from './services/ocs.ts'
import * as pis from './services/pis.ts'
import * as scms from './services/scms.ts'
import * as srms from './services/srms.ts'
import * as srs from './services/srs.ts'
import * as ums from './services/ums.ts'

export const app = new Hono<AppEnv>().basePath('/api')

const id = (c: Context, name = 'id') => pis.assertPositiveId(c.req.param(name))
async function body(c: Context): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    throw bad('請求內容須為 JSON')
  }
}
const ok = (c: Context) => c.json({ ok: true })
const later = (p: Promise<unknown>) => { try { waitUntil(p) } catch { void p } }

// ─── Middleware ─────────────────────────────────────────────────────────────

app.onError((err, c) => {
  const e = err instanceof AppError ? err : fromPgError(err)
  if (e) return c.json({ error: e.message, code: e.code, ...e.extra }, e.status as 400)
  if (err instanceof HTTPException) return c.json({ error: err.message || '請求無效', code: 'http' }, err.status)
  console.error(err)
  return c.json({ error: '系統發生錯誤，請稍後再試', code: 'server_error' }, 500)
})
app.notFound((c) => c.json({ error: '找不到這個 API', code: 'not_found' }, 404))

app.use('*', secureHeaders())
app.use('*', async (c, next) => {
  await next()
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store')
})
app.use('*', bodyLimit({ maxSize: 4 * 1024 * 1024, onError: (c) => c.json({ error: '上傳內容太大（上限 4 MB）', code: 'too_large' }, 413) }))
app.use('*', session)

// BMS-N-005: during maintenance only admins (and sign-in itself) get through.
const OPEN_DURING_MAINTENANCE = /^\/api\/(health|status|auth\/|admin\/|cron\/)/
app.use('*', async (c, next) => {
  if (!OPEN_DURING_MAINTENANCE.test(c.req.path) && !hasRole(c.get('user'), 'admin')) {
    const m = await dbs.getMaintenance()
    if (m.enabled) return c.json({ error: m.message || '系統維護中，請稍後再試', code: 'maintenance' }, 503)
  }
  await next()
})

// ─── Public ─────────────────────────────────────────────────────────────────

app.get('/health', async (c) => {
  await q('SELECT 1')
  return c.json({ ok: true, time: new Date().toISOString() })
})

app.get('/status', async (c) => c.json({ maintenance: await dbs.getMaintenance(true) }))

app.get('/catalog', async (c) => {
  // the CDN keeps the menu briefly (INT-003's "cache the hot menu" without Redis)
  c.header('Cache-Control', 'public, max-age=0, s-maxage=15, stale-while-revalidate=60')
  return c.json(await srms.catalog())
})
app.get('/stores/:id/stock', async (c) => c.json(await pis.publicStock(id(c))))
app.get('/stores/:id/reviews', async (c) => c.json(await srms.storeReviews(id(c))))
app.get('/products/search', async (c) => c.json({ ids: await srms.search(c.req.query()) }))
app.get('/products/:id/also-bought', async (c) => c.json(await srms.alsoBought(id(c))))
app.post('/quote', async (c) => c.json(await scms.quote(await body(c), c.get('user')?.memberId ?? null)))

// ─── Sign-in (UMS) ──────────────────────────────────────────────────────────

app.post('/auth/register', async (c) => {
  const r = await ums.register(await body(c))
  if (r.needsVerification) return c.json({ user: null, needsVerification: true }, 201)
  await startSession(c, r.userId)
  return c.json({ user: await ums.me((await ums.loadUser(r.userId))!) }, 201)
})
app.post('/auth/login', async (c) => {
  const userId = await ums.login(await body(c))
  await startSession(c, userId)
  return c.json({ user: await ums.me((await ums.loadUser(userId))!) })
})
app.post('/auth/logout', (c) => { endSession(c); return ok(c) })
app.get('/auth/me', async (c) => {
  const u = c.get('user')
  return c.json({ user: u ? await ums.me(u) : null })
})
app.get('/auth/verify', async (c) => {
  const verified = await ums.verifyEmail(c.req.query('token') ?? '')
  return c.redirect(`${env.appUrl}/login?verified=${verified ? 1 : 0}`)
})

app.patch('/me', async (c) => { await ums.updateProfile(currentUser(c).userId, await body(c)); return ok(c) })
app.post('/me/password', async (c) => { await ums.changePassword(currentUser(c).userId, await body(c)); return ok(c) })

// ─── Customer ───────────────────────────────────────────────────────────────

app.get('/me/points', async (c) => c.json(await dis.pointsOf(customerOf(c).memberId)))
app.get('/me/usual', async (c) => c.json(await srms.usualFor(customerOf(c).memberId)))

app.get('/cart', async (c) => c.json(await scms.getCart(customerOf(c).memberId)))
app.post('/cart/items', async (c) => c.json(await scms.addToCart(customerOf(c).memberId, await body(c)), 201))
app.patch('/cart/items/:id', async (c) => { await scms.updateCartItem(customerOf(c).memberId, id(c), await body(c)); return ok(c) })
app.delete('/cart/items/:id', async (c) => { await scms.removeCartItem(customerOf(c).memberId, id(c)); return ok(c) })
app.post('/cart/merge', async (c) => c.json(await scms.mergeGuestCart(customerOf(c).memberId, await body(c))))

app.post('/orders', async (c) => {
  const r = await ocs.placeOrder(customerOf(c), await body(c))
  later(r.mail)
  return c.json({ id: r.id, pickupNo: r.pickupNo }, 201)
})
app.get('/orders', async (c) => c.json(await ocs.memberOrders(customerOf(c).memberId, c.req.query())))
app.get('/orders/:id', async (c) => c.json(await ocs.getOrder(id(c), { memberId: customerOf(c).memberId })))
app.get('/orders/:id/status', async (c) => c.json(await ocs.orderStatus(id(c), customerOf(c).memberId)))
app.post('/orders/:id/cancel', async (c) => { await ocs.cancelOrder(customerOf(c), id(c)); return ok(c) })
app.post('/orders/:id/review', async (c) => c.json(await srms.addReview(customerOf(c).memberId, id(c), await body(c)), 201))

// ─── Staff (staff or admin) ─────────────────────────────────────────────────

const staff = new Hono<AppEnv>()
staff.use('*', requireRole('staff', 'admin'))

staff.get('/overview', async (c) => {
  const u = currentUser(c)
  const stores = (await pis.listStores()).filter((s) => u.storeIds.includes(s.id as number))
  return c.json({ stores, alerts: await pis.stockAlerts(u) })
})
staff.get('/stores/:id/board', async (c) => c.json(await ocs.storeBoard(currentUser(c), id(c))))
staff.get('/orders/:id', async (c) => c.json(await ocs.getOrder(id(c), { storeIds: currentUser(c).storeIds })))
staff.post('/orders/:id/advance', async (c) => c.json(await ocs.advanceOrder(currentUser(c), id(c), await body(c))))

staff.get('/products', async (c) => c.json(await pis.listProducts({ includeDeleted: true })))
staff.post('/products', async (c) => c.json(await pis.createProduct(await body(c)), 201))
staff.put('/products/:id', async (c) => { await pis.updateProduct(id(c), await body(c)); return ok(c) })
staff.delete('/products/:id', async (c) => { await pis.setProductDeleted(id(c), true); return ok(c) })
staff.post('/products/:id/restore', async (c) => { await pis.setProductDeleted(id(c), false); return ok(c) })

staff.get('/categories', async (c) => c.json(await pis.listCategories()))
staff.post('/categories', async (c) => c.json(await pis.createCategory(await body(c)), 201))
staff.put('/categories/:id', async (c) => { await pis.updateCategory(id(c), await body(c)); return ok(c) })

staff.get('/options', async (c) => c.json(await pis.listOptions({ includeDeleted: true })))
staff.post('/options', async (c) => c.json(await pis.createOption(await body(c)), 201))
staff.put('/options/:id', async (c) => { await pis.updateOption(id(c), await body(c)); return ok(c) })
staff.delete('/options/:id', async (c) => { await pis.setOptionDeleted(id(c), true); return ok(c) })
staff.post('/options/:id/restore', async (c) => { await pis.setOptionDeleted(id(c), false); return ok(c) })

const myStore = (c: Context<AppEnv>) => {
  const storeId = id(c)
  if (!currentUser(c).storeIds.includes(storeId)) throw new AppError(403, '你不是這間門市的店員', 'forbidden')
  return storeId
}
staff.put('/stores/:id', async (c) => { await pis.updateStore(myStore(c), await body(c)); return ok(c) })
staff.get('/stores/:id/stock', async (c) => c.json(await pis.storeStock(myStore(c))))
staff.put('/stores/:id/stock/:productId', async (c) => {
  await pis.setStock(myStore(c), id(c, 'productId'), await body(c))
  return ok(c)
})
staff.get('/alerts', async (c) => c.json(await pis.stockAlerts(currentUser(c))))

staff.get('/discounts', async (c) => c.json(await dis.listDiscounts()))
staff.post('/discounts', async (c) => c.json(await dis.createDiscount(await body(c)), 201))
staff.put('/discounts/:code', async (c) => { await dis.updateDiscount(c.req.param('code'), await body(c)); return ok(c) })
staff.delete('/discounts/:code', async (c) => { await dis.deleteDiscount(c.req.param('code')); return ok(c) })

// SRS-F-001..005: every report as JSON, or as CSV with ?format=csv
staff.get('/reports/:kind', async (c) => {
  const u = currentUser(c)
  const params = c.req.query()
  const r = srs.readRange(u, params)
  const kind = c.req.param('kind')
  let rows: Record<string, unknown>[]
  let columns = kind
  switch (kind) {
    case 'summary': return c.json(await srs.summary(u, r))
    case 'sales': rows = await srs.salesByPeriod(u, r, params.period ?? 'day'); break
    case 'best-sellers': rows = await srs.bestSellers(u, r, Number(params.top) || 5); break
    case 'purchases': rows = await srs.purchases(u, r, params.by ?? 'product'); columns = `purchases-${params.by ?? 'product'}`; break
    case 'hourly': rows = await srs.byHour(u, r); break
    case 'category': rows = await srs.byCategory(u, r); break
    default: throw bad('沒有這種報表')
  }
  if (params.format === 'csv') {
    const name = `tehcha-${kind}-${r.from}_${r.to}.csv`
    return c.body(srs.toCsv(srs.COLUMNS[columns], rows), 200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}"`,
    })
  }
  return c.json({ range: r, rows })
})

app.route('/staff', staff)

// ─── Admin ──────────────────────────────────────────────────────────────────

const admin = new Hono<AppEnv>()
admin.use('*', requireRole('admin'))

admin.get('/users', async (c) => c.json(await ums.listUsers(c.req.query())))
admin.post('/users', async (c) => c.json(await ums.createUser(await body(c)), 201))
admin.get('/users/:id', async (c) => c.json(await ums.userDetail(id(c))))
admin.put('/users/:id', async (c) => { await ums.updateUser(currentUser(c), id(c), await body(c)); return ok(c) })
admin.post('/users/:id/status', async (c) => { await ums.setStatus(currentUser(c), id(c), await body(c)); return ok(c) })
admin.post('/users/:id/warn', async (c) => { await ums.warnUser(currentUser(c), id(c), await body(c)); return ok(c) })

admin.post('/stores', async (c) => c.json(await pis.createStore(await body(c)), 201))

admin.get('/backups', async (c) => c.json(await dbs.listBackups()))
admin.post('/backups', async (c) => c.json(await dbs.createBackup('manual', currentUser(c).loginId), 201))
admin.get('/backups/:id/download', async (c) => {
  const b = await dbs.backupFile(id(c))
  const stamp = b.createdAt.toISOString().slice(0, 16).replace(/[-:T]/g, '')
  return c.body(new Uint8Array(b.payload), 200, {
    'Content-Type': 'application/gzip',
    'Content-Disposition': `attachment; filename="tehcha-backup-${stamp}.json.gz"`,
  })
})
admin.post('/backups/:id/restore', async (c) => c.json({ restored: await dbs.restoreFromSnapshot(id(c), currentUser(c).loginId) }))
admin.delete('/backups/:id', async (c) => { await dbs.deleteBackup(id(c)); return ok(c) })
admin.post('/restore', async (c) => {
  const buf = Buffer.from(await c.req.arrayBuffer())
  if (!buf.length) throw bad('請選擇備份檔')
  return c.json({ restored: await dbs.restore(buf, currentUser(c).loginId) })
})

admin.get('/integrity', async (c) => c.json(await dbs.integrityCheck()))
admin.get('/maintenance', async (c) => c.json(await dbs.getMaintenance(true)))
admin.put('/maintenance', async (c) => c.json(await dbs.setMaintenance(await body(c))))

app.route('/admin', admin)

// ─── Scheduled jobs (Vercel Cron) ───────────────────────────────────────────

// DBS-N-002: daily backup, 30-day retention. Vercel sends "Authorization: Bearer $CRON_SECRET".
app.get('/cron/backup', async (c) => {
  const secret = env.cronSecret
  const auth = c.req.header('authorization')
  const fromVercelCron = (c.req.header('user-agent') ?? '').startsWith('vercel-cron')
  if (secret ? auth !== `Bearer ${secret}` : !fromVercelCron) throw new AppError(401, 'unauthorized', 'unauthorized')
  return c.json(await dbs.dailyBackup())
})
