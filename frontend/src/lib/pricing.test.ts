import { describe, expect, it } from 'vitest'
import { canCancel, computeTotals, nextStatus, validateQuantity } from './pricing'
import type { Discount } from '@/types'

const today = '2026-11-05'
const shipping: Discount = { code: 'SHIP500', type: 'shipping', description: '滿額免運', startDate: '2026-01-01', endDate: '2026-12-31', minPurchaseAmount: 500 }
const season: Discount = { code: 'AUT10', type: 'seasonings', description: '秋季', startDate: '2026-11-01', endDate: '2026-11-30', discountRate: 0.1 }
const b1g1: Discount = { code: 'B1G1', type: 'special_event', description: '買一送一', startDate: '2026-11-01', endDate: '2026-11-30', ruleType: 'buy1get1', productIds: [1] }

const base = { fulfillment: 'pickup' as const, discounts: [] as Discount[], today, pointsRequested: 0, pointsBalance: 0 }

describe('computeTotals', () => {
  it('adds option surcharge, 5% tax, and no shipping for pickup', () => {
    const t = computeTotals({ ...base, lines: [{ productId: 1, unitPrice: 50, optionsExtra: 10, quantity: 2 }] })
    expect(t.subtotal).toBe(120)
    expect(t.tax).toBe(6)
    expect(t.shippingFee).toBe(0)
    expect(t.total).toBe(126)
  })

  it('charges NT$60 delivery, waived over the threshold', () => {
    const small = computeTotals({ ...base, fulfillment: 'delivery', discounts: [shipping], lines: [{ productId: 2, unitPrice: 100, optionsExtra: 0, quantity: 1 }] })
    expect(small.shippingFee).toBe(60)
    const big = computeTotals({ ...base, fulfillment: 'delivery', discounts: [shipping], lines: [{ productId: 2, unitPrice: 100, optionsExtra: 0, quantity: 5 }] })
    expect(big.shippingFee).toBe(0)
    expect(big.discountAmount).toBe(60)
  })

  it('stacks the three discount types (BR-005)', () => {
    const t = computeTotals({
      ...base, fulfillment: 'delivery', discounts: [shipping, season, b1g1],
      lines: [{ productId: 1, unitPrice: 100, optionsExtra: 0, quantity: 4 }, { productId: 2, unitPrice: 100, optionsExtra: 0, quantity: 4 }],
    })
    // subtotal 800, b1g1 saves 2 cups = 200, seasonal 10% of 600 = 60, 540 >= 500 so shipping 60 waived
    expect(t.applied.map((a) => a.code).sort()).toEqual(['AUT10', 'B1G1', 'SHIP500'])
    expect(t.discountAmount).toBe(320)
  })

  it('ignores expired discounts', () => {
    const t = computeTotals({ ...base, discounts: [{ ...season, endDate: '2026-10-31' }], lines: [{ productId: 2, unitPrice: 100, optionsExtra: 0, quantity: 1 }] })
    expect(t.discountAmount).toBe(0)
  })

  it('caps points at 50% of payable and at the balance (BR-004)', () => {
    const lines = [{ productId: 2, unitPrice: 100, optionsExtra: 0, quantity: 1 }]
    const capped = computeTotals({ ...base, lines, pointsBalance: 500, pointsRequested: 500 })
    expect(capped.pointsUsed).toBe(52) // payable 105 -> floor(52.5)
    const lowBalance = computeTotals({ ...base, lines, pointsBalance: 10, pointsRequested: 500 })
    expect(lowBalance.pointsUsed).toBe(10)
  })

  it('earns 1 point per NT$10 paid, rounded down (BR-003)', () => {
    const t = computeTotals({ ...base, lines: [{ productId: 2, unitPrice: 100, optionsExtra: 0, quantity: 1 }] })
    expect(t.total).toBe(105)
    expect(t.pointsEarned).toBe(10)
  })

  it('never goes below zero (BR-002)', () => {
    const t = computeTotals({ ...base, discounts: [{ ...season, discountRate: 1 }], lines: [{ productId: 2, unitPrice: 10, optionsExtra: 0, quantity: 1 }] })
    expect(t.total).toBeGreaterThanOrEqual(0)
  })
})

describe('order state machine', () => {
  it('only moves forward', () => {
    expect(nextStatus('received')).toBe('processing')
    expect(nextStatus('processing')).toBe('shipping')
    expect(nextStatus('shipping')).toBe('closed')
    expect(nextStatus('closed')).toBeNull()
  })
  it('allows cancel only when received (BR-006)', () => {
    expect(canCancel('received')).toBe(true)
    expect(canCancel('processing')).toBe(false)
  })
})

describe('validateQuantity', () => {
  it('rejects zero, fractions and over-stock', () => {
    expect(validateQuantity(0, 5)).not.toBeNull()
    expect(validateQuantity(1.5, 5)).not.toBeNull()
    expect(validateQuantity(6, 5)).not.toBeNull()
    expect(validateQuantity(5, 5)).toBeNull()
  })
})
