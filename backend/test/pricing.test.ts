// TR-001: unit tests for the core business rules (amounts, state machine, points).
import { describe, expect, it } from 'vitest'
import { canCancel, canTransition, nextStatus } from '../src/domain/orderFlow.ts'
import { computeTotals, pointsFor, specialSaving, type DiscountRule, type PriceLine } from '../src/domain/pricing.ts'
import { addDays, businessDate, isDate } from '../src/domain/time.ts'

const TODAY = '2026-11-24'
const rule = (x: Partial<DiscountRule> & Pick<DiscountRule, 'code' | 'type'>): DiscountRule => ({
  description: x.code, startDate: '2026-01-01', endDate: '2026-12-31', discountRate: null, ruleType: null,
  minPurchaseAmount: null, productIds: [], ...x,
})
const line = (productId: number, unitPrice: number, quantity: number, optionsExtra = 0): PriceLine => ({ productId, unitPrice, optionsExtra, quantity })

describe('computeTotals (OCS-F-002, BR-002)', () => {
  it('adds option surcharges, 5% tax and no shipping for pickup', () => {
    const t = computeTotals({ lines: [line(1, 55, 2, 10), line(2, 45, 1)], fulfillment: 'pickup', discounts: [], today: TODAY })
    expect(t.subtotal).toBe(175)
    expect(t.tax).toBe(9) // 8.75 rounds to 9
    expect(t.shippingFee).toBe(0)
    expect(t.total).toBe(184)
    expect(t.pointsEarned).toBe(18)
  })

  it('charges NT$60 for delivery (BR-009)', () => {
    const t = computeTotals({ lines: [line(1, 100, 1)], fulfillment: 'delivery', discounts: [], today: TODAY })
    expect(t.shippingFee).toBe(60)
    expect(t.total).toBe(100 + 5 + 60)
  })

  it('stacks special, seasonal and shipping discounts (BR-005, DIS-F-006)', () => {
    const discounts = [
      rule({ code: 'EVT', type: 'special_event', ruleType: 'rate', discountRate: 0.2, productIds: [1] }),
      rule({ code: 'SEA', type: 'seasonal', discountRate: 0.1 }),
      rule({ code: 'SHP', type: 'shipping', minPurchaseAmount: 250 }), // 380 − 60 − 32 = 288 ≥ 250
    ]
    const t = computeTotals({ lines: [line(1, 100, 3), line(2, 80, 1)], fulfillment: 'delivery', discounts, today: TODAY })
    expect(t.subtotal).toBe(380)
    expect(t.applied.map((a) => [a.code, a.amount])).toEqual([['EVT', 60], ['SEA', 32], ['SHP', 60]])
    expect(t.discountAmount).toBe(152)
    expect(t.total).toBe(380 + 19 + 60 - 152)
  })

  it('applies the shipping waiver only once the discounted goods reach the threshold', () => {
    const discounts = [rule({ code: 'SEA', type: 'seasonal', discountRate: 0.1 }), rule({ code: 'SHP', type: 'shipping', minPurchaseAmount: 500 })]
    const t = computeTotals({ lines: [line(1, 520, 1)], fulfillment: 'delivery', discounts, today: TODAY })
    expect(t.applied.map((a) => a.code)).toEqual(['SEA']) // 520 − 52 = 468 < 500
    const pickup = computeTotals({ lines: [line(1, 600, 1)], fulfillment: 'pickup', discounts, today: TODAY })
    expect(pickup.applied.map((a) => a.code)).toEqual(['SEA']) // nothing to waive on pickup
  })

  it('takes the best seasonal discount and honours its threshold', () => {
    const discounts = [
      rule({ code: 'A', type: 'seasonal', discountRate: 0.05 }),
      rule({ code: 'B', type: 'seasonal', discountRate: 0.2, minPurchaseAmount: 1000 }),
      rule({ code: 'C', type: 'seasonal', discountRate: 0.1 }),
    ]
    const t = computeTotals({ lines: [line(1, 200, 1)], fulfillment: 'pickup', discounts, today: TODAY })
    expect(t.applied).toEqual([{ code: 'C', type: 'seasonal', description: 'C', amount: 20 }])
  })

  it('ignores discounts outside their dates', () => {
    const discounts = [rule({ code: 'OLD', type: 'seasonal', discountRate: 0.5, startDate: '2026-01-01', endDate: '2026-11-23' })]
    expect(computeTotals({ lines: [line(1, 100, 1)], fulfillment: 'pickup', discounts, today: TODAY }).discountAmount).toBe(0)
    expect(computeTotals({ lines: [line(1, 100, 1)], fulfillment: 'pickup', discounts, today: '2026-11-23' }).discountAmount).toBe(50)
  })

  it('caps points at 50% of the amount due and at the balance (BR-004)', () => {
    const base = { lines: [line(1, 100, 1)], fulfillment: 'pickup' as const, discounts: [], today: TODAY }
    expect(computeTotals({ ...base, pointsRequested: 999, pointsBalance: 999 }).pointsUsed).toBe(52) // floor(105 / 2)
    expect(computeTotals({ ...base, pointsRequested: 999, pointsBalance: 30 }).pointsUsed).toBe(30)
    expect(computeTotals({ ...base, pointsRequested: -5, pointsBalance: 30 }).pointsUsed).toBe(0)
    const t = computeTotals({ ...base, pointsRequested: 20, pointsBalance: 30 })
    expect(t.total).toBe(85)
    expect(t.pointsEarned).toBe(8) // BR-003: earned on what was actually paid
  })

  it('never goes below zero', () => {
    const t = computeTotals({ lines: [line(1, 100, 1)], fulfillment: 'pickup', discounts: [rule({ code: 'ALL', type: 'seasonal', discountRate: 1 })], today: TODAY, pointsRequested: 100, pointsBalance: 100 })
    expect(t.total).toBeGreaterThanOrEqual(0)
    expect(t.payable).toBe(5)
  })

  it('handles an empty cart', () => {
    const t = computeTotals({ lines: [], fulfillment: 'pickup', discounts: [], today: TODAY })
    expect(t).toMatchObject({ subtotal: 0, tax: 0, total: 0, pointsEarned: 0 })
  })
})

describe('specialSaving (DIS-F-005)', () => {
  const b1g1 = rule({ code: 'B', type: 'special_event', ruleType: 'buy1get1', productIds: [6] })
  it('gives every second cup free', () => {
    expect(specialSaving(b1g1, [line(6, 75, 1)])).toBe(0)
    expect(specialSaving(b1g1, [line(6, 75, 2)])).toBe(75)
    expect(specialSaving(b1g1, [line(6, 75, 5)])).toBe(150)
  })
  it('pairs cups across lines and frees the cheaper ones', () => {
    expect(specialSaving(b1g1, [line(6, 75, 1, 20), line(6, 75, 1)])).toBe(75)
  })
  it('only touches listed products', () => {
    expect(specialSaving(b1g1, [line(5, 70, 4)])).toBe(0)
  })
  it('rounds a rate discount to whole dollars', () => {
    expect(specialSaving(rule({ code: 'R', type: 'special_event', ruleType: 'rate', discountRate: 0.15, productIds: [9] }), [line(9, 65, 1)])).toBe(10)
  })
})

describe('order state machine (BR-001, BR-006)', () => {
  it('moves one step at a time and stops at closed', () => {
    expect(nextStatus('received')).toBe('processing')
    expect(nextStatus('processing')).toBe('shipping')
    expect(nextStatus('shipping')).toBe('closed')
    expect(nextStatus('closed')).toBeNull()
    expect(nextStatus('cancelled')).toBeNull()
  })
  it('rejects skipping and going back', () => {
    expect(canTransition('received', 'shipping')).toBe(false)
    expect(canTransition('shipping', 'processing')).toBe(false)
    expect(canTransition('processing', 'shipping')).toBe(true)
  })
  it('allows cancelling only before brewing starts', () => {
    expect(canCancel('received')).toBe(true)
    expect(canCancel('processing')).toBe(false)
    expect(canTransition('received', 'cancelled')).toBe(true)
    expect(canTransition('closed', 'cancelled')).toBe(false)
  })
})

describe('points and dates', () => {
  it('earns 1 point per NT$10, rounded down (BR-003)', () => {
    expect(pointsFor(9)).toBe(0)
    expect(pointsFor(155)).toBe(15)
    expect(pointsFor(-10)).toBe(0)
  })
  it('uses Taipei business days', () => {
    expect(businessDate(new Date('2026-11-24T16:30:00Z'))).toBe('2026-11-25') // 00:30 in Taipei
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(isDate('2026-02-30')).toBe(false)
    expect(isDate('2026-02-28')).toBe(true)
  })
})
