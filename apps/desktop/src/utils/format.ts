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

export function toLocalDateTimeInput(isoInstant: string | Date) {
  const date = isoInstant instanceof Date ? isoInstant : new Date(isoInstant)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function fromLocalDateTimeInput(value: string) {
  return new Date(value).toISOString()
}
