import type { OrderStatus } from '@/types'

export const money = (n: number) => `NT$${Math.round(n).toLocaleString('en-US')}`

export const todayStr = () => {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export const fmtDateTime = (iso: string) => {
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

export const STATUS_LABEL: Record<OrderStatus, { zh: string; en: string }> = {
  received: { zh: '已接單', en: 'Received' },
  processing: { zh: '製作中', en: 'Brewing' },
  shipping: { zh: '待取 / 配送中', en: 'Ready' },
  closed: { zh: '已結案', en: 'Complete' },
}
