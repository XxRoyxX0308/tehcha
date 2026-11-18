import type { AppliedDiscount, Discount, Fulfillment, OrderStatus } from '@/types'

// Tentative values from SRS BR-003/004/009 ("待小組確認").
export const TAX_RATE = 0.05
export const DELIVERY_FEE = 60
export const POINT_EARN_PER_NT = 10
export const POINT_REDEEM_CAP = 0.5

export interface PricedLine {
  productId: number
  unitPrice: number // base product price
  optionsExtra: number // sum of option surcharges per cup
  quantity: number
}

export interface TotalsInput {
  lines: PricedLine[]
  fulfillment: Fulfillment
  discounts: Discount[]
  today: string // yyyy-mm-dd
  pointsRequested: number
  pointsBalance: number
}

export interface Totals {
  subtotal: number
  tax: number
  shippingFee: number // after shipping discount
  discountAmount: number // special + seasonal + shipping
  applied: AppliedDiscount[]
  pointsUsed: number
  maxPoints: number
  total: number
  pointsEarned: number
}

const lineTotal = (l: PricedLine) => (l.unitPrice + l.optionsExtra) * l.quantity
const active = (d: Discount, today: string) => d.startDate <= today && today <= d.endDate

export function computeTotals(input: TotalsInput): Totals {
  const { lines, fulfillment, discounts, today } = input
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0)
  const applied: AppliedDiscount[] = []

  // 1. Special event (product level). Per BR-010/011 only one is live per product; take best per line anyway.
  let special = 0
  const specials = discounts.filter((d) => d.type === 'special_event' && active(d, today))
  for (const line of lines) {
    let best = 0
    let bestD: Discount | null = null
    for (const d of specials) {
      if (!d.productIds?.includes(line.productId)) continue
      const cup = line.unitPrice + line.optionsExtra
      const saving =
        d.ruleType === 'buy1get1'
          ? Math.floor(line.quantity / 2) * cup
          : Math.round(cup * line.quantity * (d.discountRate ?? 0))
      if (saving > best) { best = saving; bestD = d }
    }
    if (bestD && best > 0) {
      special += best
      const prev = applied.find((a) => a.code === bestD!.code)
      if (prev) prev.amount += best
      else applied.push({ code: bestD.code, description: bestD.description, amount: best })
    }
  }

  // 2. Seasonal (order level) on what's left after special discounts.
  const afterSpecial = subtotal - special
  let seasonal = 0
  const seasonals = discounts
    .filter((d) => d.type === 'seasonings' && active(d, today) && afterSpecial >= (d.minPurchaseAmount ?? 0))
    .map((d) => ({ d, amount: Math.round(afterSpecial * (d.discountRate ?? 0)) }))
    .sort((a, b) => b.amount - a.amount)
  if (seasonals[0] && seasonals[0].amount > 0) {
    seasonal = seasonals[0].amount
    applied.push({ code: seasonals[0].d.code, description: seasonals[0].d.description, amount: seasonal })
  }

  // 3. Shipping (order level): waives the delivery fee above a threshold.
  const baseShipping = fulfillment === 'delivery' ? DELIVERY_FEE : 0
  let shippingDiscount = 0
  const afterSeasonal = afterSpecial - seasonal
  const ship = discounts.find(
    (d) => d.type === 'shipping' && active(d, today) && afterSeasonal >= (d.minPurchaseAmount ?? 0),
  )
  if (ship && baseShipping > 0) {
    shippingDiscount = baseShipping
    applied.push({ code: ship.code, description: ship.description, amount: shippingDiscount })
  }

  const tax = Math.round(subtotal * TAX_RATE)
  const shippingFee = baseShipping - shippingDiscount
  const discountAmount = special + seasonal + shippingDiscount

  const payable = Math.max(0, subtotal + tax + baseShipping - discountAmount)
  const maxPoints = Math.max(0, Math.min(input.pointsBalance, Math.floor(payable * POINT_REDEEM_CAP)))
  const pointsUsed = Math.max(0, Math.min(Math.floor(input.pointsRequested), maxPoints))
  const total = Math.max(0, payable - pointsUsed)

  return {
    subtotal, tax, shippingFee, discountAmount, applied,
    pointsUsed, maxPoints, total,
    pointsEarned: Math.floor(total / POINT_EARN_PER_NT),
  }
}

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
  if (qty > stock) return `庫存不足，目前最多 ${stock} 杯`
  return null
}
