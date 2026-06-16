import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createExpense,
  deleteExpense,
  getCategories,
  getExpenses,
  getMe,
  getMonthlyAnalytics,
  request,
  updateExpense,
} from './client'

const fetchMock = vi.fn<typeof fetch>()

vi.stubGlobal('fetch', fetchMock)

afterEach(() => {
  fetchMock.mockReset()
})

describe('request', () => {
  it('joins base URL and path, then returns JSON payloads', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { status: 'ok' } }))

    const payload = await request<{ data: { status: string } }>('http://localhost:8080/', '/health')

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/health', expect.any(Object))
    expect(payload.data.status).toBe('ok')
  })

  it('normalizes Headers instances and adds token authorization', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: true }))

    await request<boolean>('http://localhost:8080', '/api/me', {
      headers: new Headers({ Accept: 'application/json' }),
      token: 'member-token',
    })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.get('Authorization')).toBe('Bearer member-token')
  })

  it('preserves caller content type over JSON default', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: true }))

    await request<boolean>('http://localhost:8080', '/upload', {
      method: 'POST',
      body: 'name,value',
      headers: { 'Content-Type': 'text/csv' },
    })

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit
    const headers = init.headers as Headers
    expect(headers.get('Content-Type')).toBe('text/csv')
  })

  it('returns undefined for 204 responses', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))

    await expect(request<undefined>('http://localhost:8080', '/api/expenses/1')).resolves.toBeUndefined()
  })

  it('throws API errors from JSON error payloads', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, { status: 401 }))

    await expect(request('http://localhost:8080', '/api/me')).rejects.toMatchObject({
      status: 401,
      message: 'unauthorized',
    })
  })

  it('falls back to status text for non-JSON errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }))

    await expect(request('http://localhost:8080', '/api/me')).rejects.toMatchObject({
      status: 500,
      message: 'HTTP 500',
    })
  })
})

describe('device API helpers', () => {
  it('fetches the current member session with bearer auth', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { household: { id: 1 }, member: { id: 2 } } }))

    const session = await getMe('http://localhost:8080', 'member-token')

    expect(fetchMock).toHaveBeenCalledWith('http://localhost:8080/api/me', expect.any(Object))
    expect(authHeader()).toBe('Bearer member-token')
    expect(session.member.id).toBe(2)
  })

  it('fetches categories, expenses, and monthly analytics for a month', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 10, name: '餐饮' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 20, amountCents: 1200 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { totalCents: 1200, expenseCount: 1 } }))

    await getCategories('http://localhost:8080', 'member-token')
    await getExpenses('http://localhost:8080', 'member-token', '2026-06')
    const analytics = await getMonthlyAnalytics('http://localhost:8080', 'member-token', '2026-06')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:8080/api/categories')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost:8080/api/expenses?month=2026-06')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://localhost:8080/api/analytics/monthly?month=2026-06')
    expect(analytics.expenseCount).toBe(1)
  })

  it('creates, updates, and deletes expenses', async () => {
    const input = {
      amountCents: 12345,
      categoryId: 10,
      currency: 'CNY',
      note: '午餐',
      spentAt: '2026-06-16T00:00:00.000Z',
    }
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { id: 30, ...input } }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 30, ...input, note: '晚餐' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 30, deleted: true } }))

    const created = await createExpense('http://localhost:8080', 'member-token', input)
    const updated = await updateExpense('http://localhost:8080', 'member-token', 30, { ...input, note: '晚餐' })
    const deleted = await deleteExpense('http://localhost:8080', 'member-token', 30)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:8080/api/expenses')
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost:8080/api/expenses/30')
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('PATCH')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://localhost:8080/api/expenses/30')
    expect((fetchMock.mock.calls[2]?.[1] as RequestInit).method).toBe('DELETE')
    expect(created.id).toBe(30)
    expect(updated.note).toBe('晚餐')
    expect(deleted.deleted).toBe(true)
  })
})

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

function authHeader() {
  const init = fetchMock.mock.calls.at(-1)?.[1] as RequestInit
  return (init.headers as Headers).get('Authorization')
}
