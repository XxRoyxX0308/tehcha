// Order state machine (OCS-F-003, BR-001, BR-006). The database trigger orders_status_guard
// enforces the same rules; this copy lets the API answer with a clear message first.

export type OrderStatus = 'received' | 'processing' | 'shipping' | 'closed' | 'cancelled'

export const FLOW: OrderStatus[] = ['received', 'processing', 'shipping', 'closed']
export const ACTIVE: OrderStatus[] = ['received', 'processing', 'shipping']

export const STATUS_ZH: Record<OrderStatus, string> = {
  received: '已接單',
  processing: '製作中',
  shipping: '待取 / 配送中',
  closed: '已結案',
  cancelled: '已取消',
}

export function nextStatus(s: OrderStatus): OrderStatus | null {
  const i = FLOW.indexOf(s)
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null
}

export const canCancel = (s: OrderStatus) => s === 'received'

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (to === 'cancelled') return canCancel(from)
  return nextStatus(from) === to
}
