// Order pricing (OCS-F-002, BR-002..005, BR-009). Pure functions: the cart quote and the
// order write call the same code, so what the customer sees is what the order stores.
//
//   total = subtotal + tax + shipping fee − discounts − points, never below 0
//
// Rules marked tentative in the SRS (待小組確認) live here as constants.

export const TAX_RATE = 0.05            // BR-009, on the item subtotal
export const DELIVERY_FEE = 60          // BR-009, pickup ships free
export const POINT_EARN_PER_NT = 10     // BR-003: 1 point per NT$10 paid, credited at close
export const POINT_REDEEM_CAP = 0.5     // BR-004: points cover at most 50% of the amount due (1 point = NT$1)

export type DiscountType = 'shipping' | 'seasonal' | 'special_event'

export interface DiscountRule {
  code: string
  type: DiscountType
  description: string
  startDate: string // yyyy-mm-dd, inclusive
  endDate: string
  discountRate: number | null // fraction off: 0.1 = 10% off
  ruleType: 'rate' | 'buy1get1' | null
  minPurchaseAmount: number | null
  productIds: number[]
}

export interface PriceLine {
  productId: number
  unitPrice: number // base product price
  optionsExtra: number // option surcharges per cup
  quantity: number
}

export interface AppliedDiscount {
  code: string
  type: DiscountType
  description: string
  amount: number
}

export interface Totals {
  subtotal: number
  tax: number
  shippingFee: number // the fee charged before any shipping discount
  discountAmount: number // special + seasonal + shipping waiver
  applied: AppliedDiscount[]
  payable: number // before points
  maxPoints: number
  pointsUsed: number
  total: number
  pointsEarned: number
}

export interface TotalsInput {
  lines: PriceLine[]
  fulfillment: 'pickup' | 'delivery'
  discounts: DiscountRule[]
  today: string
  pointsRequested?: number
  pointsBalance?: number
}

const money = (n: number) => Math.round(n)
export const cupPrice = (l: PriceLine) => l.unitPrice + l.optionsExtra
export const lineTotal = (l: PriceLine) => cupPrice(l) * l.quantity
export const isActive = (d: DiscountRule, today: string) => d.startDate <= today && today <= d.endDate

/** Saving from one special-event discount across the cart (DIS-F-005). */
export function specialSaving(d: DiscountRule, lines: PriceLine[]): number {
  const mine = lines.filter((l) => d.productIds.includes(l.productId))
  if (!mine.length) return 0
  if (d.ruleType === 'buy1get1') {
    // every second cup of the product is free; the cheaper cups are the free ones
    const cups = mine.flatMap((l) => Array<number>(l.quantity).fill(cupPrice(l))).sort((a, b) => a - b)
    const free = Math.floor(cups.length / 2)
    return cups.slice(0, free).reduce((s, c) => s + c, 0)
  }
  return money(mine.reduce((s, l) => s + lineTotal(l), 0) * (d.discountRate ?? 0))
}

export function computeTotals(input: TotalsInput): Totals {
  const { lines, fulfillment, today } = input
  const live = input.discounts.filter((d) => isActive(d, today))
  const subtotal = lines.reduce((s, l) => s + lineTotal(l), 0)
  const applied: AppliedDiscount[] = []

  // 1. special events, product level (BR-010/011 allow one per product at a time)
  let special = 0
  for (const d of live.filter((x) => x.type === 'special_event')) {
    const amount = specialSaving(d, lines)
    if (amount > 0) {
      special += amount
      applied.push({ code: d.code, type: d.type, description: d.description, amount })
    }
  }

  // 2. seasonal, order level: the best one live today, on what is left after special events
  const afterSpecial = subtotal - special
  const seasonal = live
    .filter((d) => d.type === 'seasonal' && afterSpecial >= (d.minPurchaseAmount ?? 0))
    .map((d) => ({ d, amount: money(afterSpecial * (d.discountRate ?? 0)) }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount)[0]
  if (seasonal) applied.push({ code: seasonal.d.code, type: 'seasonal', description: seasonal.d.description, amount: seasonal.amount })

  // 3. shipping, order level: delivery is free once the discounted goods reach the threshold
  const shippingFee = fulfillment === 'delivery' ? DELIVERY_FEE : 0
  const afterSeasonal = afterSpecial - (seasonal?.amount ?? 0)
  const ship = live
    .filter((d) => d.type === 'shipping' && afterSeasonal >= (d.minPurchaseAmount ?? 0))
    .sort((a, b) => (a.minPurchaseAmount ?? 0) - (b.minPurchaseAmount ?? 0))[0]
  if (ship && shippingFee > 0) applied.push({ code: ship.code, type: 'shipping', description: ship.description, amount: shippingFee })

  const tax = money(subtotal * TAX_RATE)
  const discountAmount = applied.reduce((s, a) => s + a.amount, 0)
  const payable = Math.max(0, subtotal + tax + shippingFee - discountAmount)
  const balance = Math.max(0, Math.floor(input.pointsBalance ?? 0))
  const maxPoints = Math.min(balance, Math.floor(payable * POINT_REDEEM_CAP))
  const requested = Math.floor(Number(input.pointsRequested) || 0)
  const pointsUsed = Math.max(0, Math.min(requested, maxPoints))
  const total = payable - pointsUsed

  return {
    subtotal, tax, shippingFee, discountAmount, applied, payable, maxPoints, pointsUsed, total,
    pointsEarned: pointsFor(total),
  }
}

/** BR-003: points credited when an order closes (rounded down). */
export const pointsFor = (paid: number) => Math.max(0, Math.floor(paid / POINT_EARN_PER_NT))
