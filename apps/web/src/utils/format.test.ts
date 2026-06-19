import { describe, expect, it } from 'vitest'
import { formatCents, formatMonth, fromLocalDateTimeInput, toLocalDateTimeInput } from './format'

describe('formatCents', () => {
  it('formats integer cents as CNY amount', () => {
    expect(formatCents(12345, 'CNY')).toBe('¥123.45')
  })
})

describe('formatMonth', () => {
  it('formats date as YYYY-MM', () => {
    expect(formatMonth(new Date('2026-06-16T00:00:00Z'))).toBe('2026-06')
  })
})

describe('datetime-local helpers', () => {
  it('round-trips API instants through local datetime input values', () => {
    const instant = '2026-06-16T08:30:00.000Z'

    expect(fromLocalDateTimeInput(toLocalDateTimeInput(instant))).toBe(instant)
  })
})
