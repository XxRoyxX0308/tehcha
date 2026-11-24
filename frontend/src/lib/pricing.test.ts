import { describe, expect, it } from 'vitest'
import { canCancel, nextStatus, validateQuantity } from './pricing'
import { discountLabel, maskTime, money } from './format'

// Amount rules are tested in the API (backend/test/pricing.test.ts); these cover what the UI decides.
describe('state machine (BR-001, BR-006)', () => {
  it('only moves forward one step', () => {
    expect(nextStatus('received')).toBe('processing')
    expect(nextStatus('shipping')).toBe('closed')
    expect(nextStatus('closed')).toBeNull()
    expect(nextStatus('cancelled')).toBeNull()
  })
  it('cancels only received orders', () => {
    expect(canCancel('received')).toBe(true)
    expect(canCancel('processing')).toBe(false)
  })
})

describe('quantity (BR-007)', () => {
  it('needs a positive integer within stock', () => {
    expect(validateQuantity(1, 5)).toBeNull()
    expect(validateQuantity(0, 5)).toMatch('大於 0')
    expect(validateQuantity(1.5, 5)).toMatch('整數')
    expect(validateQuantity(6, 5)).toMatch('最多 5 杯')
    expect(validateQuantity(1, 0)).toMatch('售完')
  })
})

describe('format', () => {
  it('prints money and discounts the way the shop says them', () => {
    expect(money(1234.4)).toBe('NT$1,234')
    expect(discountLabel(0.1)).toBe('9 折')
    expect(discountLabel(0.15)).toBe('85 折')
    expect(discountLabel(0.05)).toBe('95 折')
    expect(maskTime('2026-11-24T12:05:00Z').length).toBe(5)
  })
})
