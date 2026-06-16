export function formatCents(amountCents: number, currency = 'CNY') {
  const amount = amountCents / 100
  if (currency === 'CNY') {
    return `¥${amount.toFixed(2)}`
  }
  return `${currency} ${amount.toFixed(2)}`
}

export function formatMonth(date: Date) {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}
