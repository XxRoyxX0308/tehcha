// REST client for the BMS API (INT-001). The session lives in an httpOnly cookie set by the
// server, so nothing secret is kept in the browser.
import { reactive } from 'vue'

export class ApiError extends Error {
  constructor(public status: number, message: string, public code = 'error', public data: Record<string, unknown> = {}) {
    super(message)
  }
}

/** BMS-N-005: set when the API answers 503 maintenance; App.vue shows the notice. */
export const systemState = reactive({ maintenance: false, message: '' })

type Query = Record<string, string | number | boolean | null | undefined>

function url(path: string, query?: Query) {
  const qs = query
    ? Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
    : ''
  return `/api${path}${qs ? `?${qs}` : ''}`
}

async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
  let res: Response
  try {
    res = await fetch(url(path, query), {
      method,
      credentials: 'same-origin',
      headers: body instanceof Blob ? { 'content-type': body.type || 'application/octet-stream' } : body !== undefined ? { 'content-type': 'application/json' } : {},
      body: body instanceof Blob ? body : body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, '無法連線到伺服器，請檢查網路後再試', 'network')
  }
  const text = await res.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!res.ok) {
    if (res.status === 503 && data?.code === 'maintenance') {
      systemState.maintenance = true
      systemState.message = data.error
    }
    throw new ApiError(res.status, data?.error ?? `伺服器錯誤（${res.status}）`, data?.code, data ?? {})
  }
  return data as T
}

export const http = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, undefined, query),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
  /** URL for a file download (CSV reports, backups): the browser sends the cookie itself. */
  href: (path: string, query?: Query) => url(path, query),
}

export const errorText = (e: unknown, fallback = '發生錯誤，請稍後再試') => (e instanceof ApiError ? e.message : fallback)
