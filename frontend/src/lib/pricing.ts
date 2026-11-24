import type { OrderStatus } from '@/types'

// Amounts are computed by the API (POST /api/quote and the order itself), so the screen and the
// receipt always agree. What stays here is what the UI needs to draw and to pre-check.

// Shown in copy; the API holds the real values (backend/src/domain/pricing.ts).
export const DELIVERY_FEE = 60
export const TAX_RATE = 0.05

// ---- Order state machine (BR-001, BR-006) ----
export const STATUS_FLOW: OrderStatus[] = ['received', 'processing', 'shipping', 'closed']

export function nextStatus(s: OrderStatus): OrderStatus | null {
  const i = STATUS_FLOW.indexOf(s)
  return i >= 0 && i < STATUS_FLOW.length - 1 ? STATUS_FLOW[i + 1] : null
}

export const canCancel = (s: OrderStatus) => s === 'received'

// ---- Quantity rule (BR-007) ----
export function validateQuantity(qty: number, stock: number): string | null {
  if (!Number.isInteger(qty) || qty <= 0) return '數量須為大於 0 的整數'
  if (stock <= 0) return '本店已售完'
  if (qty > stock) return `庫存不足，目前最多 ${stock} 杯`
  return null
}
