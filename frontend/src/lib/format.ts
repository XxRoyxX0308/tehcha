import type { OrderStatus } from '@/types'

export const money = (n: number) => `NT$${Math.round(n).toLocaleString('en-US')}`

const p2 = (n: number) => String(n).padStart(2, '0')

export const fmtDateTime = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

export const fmtDate = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}/${p2(d.getMonth() + 1)}/${p2(d.getDate())}`
}

/** hh:mm in the viewer's clock. */
export const maskTime = (iso: string) => {
  const d = new Date(iso)
  return `${p2(d.getHours())}:${p2(d.getMinutes())}`
}

export const minutesAgo = (iso: string, now = Date.now()) => Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000))

/** yyyy-mm-dd in Taipei, the shop's business day. */
export const todayStr = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

export function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** 0.1 off → "9 折", 0.15 off → "85 折" (how Taiwanese shops say it). */
export function discountLabel(rate: number) {
  const pay = Math.round((1 - rate) * 100)
  return `${pay % 10 === 0 ? pay / 10 : pay} 折`
}

export const STATUS_LABEL: Record<OrderStatus, { zh: string; en: string }> = {
  received: { zh: '已接單', en: 'Received' },
  processing: { zh: '製作中', en: 'Brewing' },
  shipping: { zh: '待取 / 配送中', en: 'Ready' },
  closed: { zh: '已結案', en: 'Complete' },
  cancelled: { zh: '已取消', en: 'Cancelled' },
}

export const DISCOUNT_TYPE_LABEL = { shipping: '運費折扣', seasonal: '季節折扣', special_event: '特殊活動' } as const
export const OPTION_TYPE_LABEL = { sweetness: '甜度', ice: '冰塊', topping: '加料' } as const
export const ROLE_LABEL = { customer: '顧客', staff: '店員', admin: '管理員' } as const
