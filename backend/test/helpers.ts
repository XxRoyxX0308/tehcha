import { app } from '../src/app.ts'
import { q } from '../src/db.ts'

/** Calls the API in-process, keeping the session cookie like a browser would. */
export function client() {
  let cookie = ''
  async function call(method: string, path: string, body?: unknown) {
    const res = await app.request(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) {
      const m = /tehcha_session=([^;]*)/.exec(set)
      cookie = m && m[1] ? `tehcha_session=${m[1]}` : ''
    }
    const text = await res.text()
    let data: any
    try { data = JSON.parse(text) } catch { data = text }
    return { status: res.status, data }
  }
  return {
    get: (p: string) => call('GET', p),
    post: (p: string, b: unknown = {}) => call('POST', p, b),
    put: (p: string, b: unknown) => call('PUT', p, b),
    patch: (p: string, b: unknown) => call('PATCH', p, b),
    del: (p: string) => call('DELETE', p),
    async login(loginId: string, password: string) {
      const r = await call('POST', '/auth/login', { loginId, password })
      if (r.status !== 200) throw new Error(`login ${loginId}: ${JSON.stringify(r.data)}`)
      return r.data.user
    },
  }
}

export const stockOf = async (storeId: number, productId: number) =>
  (await q<{ s: number }>(`SELECT stock_qty AS s FROM store_product WHERE store_id = $1 AND product_id = $2`, [storeId, productId]))[0].s

export const balanceOf = async (loginId: string) =>
  (await q<{ b: number }>(`SELECT m.points_balance AS b FROM member m JOIN users u USING (user_id) WHERE u.login_id = $1`, [loginId]))[0].b

let n = 0
/** Registers a fresh customer and returns a signed-in client. */
export async function newCustomer() {
  const c = client()
  const loginId = `t${Date.now().toString(36)}${n++}`
  const r = await c.post('/auth/register', { loginId, name: '測試顧客', password: 'pass1234', email: `${loginId}@mail.example`, address: '台北市大安區' })
  if (r.status !== 201) throw new Error(JSON.stringify(r.data))
  return { c, loginId, user: r.data.user }
}

// sweetness 半糖 (3), ice 少冰 (7) from the seed
export const HALF_SUGAR = 3
export const LESS_ICE = 7
