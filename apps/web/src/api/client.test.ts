import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createExpense,
  createAdminCategory,
  createHousehold,
  createInviteCode,
  deleteExpense,
  disableInviteCode,
  exportExpensesCsv,
  exportExpensesCsvUrl,
  getCategories,
  getAdminStatus,
  getExpenses,
  getMe,
  getMonthlyAnalytics,
  listAdminCategories,
  listHouseholdMembers,
  listHouseholds,
  listInviteCodes,
  listMembers,
  request,
  updateAdminCategory,
  updateExpense,
  updateHousehold,
  updateMember,
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
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 2, nickname: '小王' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 20, amountCents: 1200 }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { totalCents: 1200, expenseCount: 1 } }))

    await getCategories('http://localhost:8080', 'member-token')
    await listHouseholdMembers('http://localhost:8080', 'member-token', 1)
    await getExpenses('http://localhost:8080', 'member-token', { month: '2026-06', categoryId: 10, memberId: 2 })
    const analytics = await getMonthlyAnalytics('http://localhost:8080', 'member-token', '2026-06')

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:8080/api/categories')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost:8080/api/households/1/members')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://localhost:8080/api/expenses?month=2026-06&categoryId=10&memberId=2')
    expect(fetchMock.mock.calls[3]?.[0]).toBe('http://localhost:8080/api/analytics/monthly?month=2026-06')
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
    expect(requestInit(0).method).toBe('POST')
    expect(requestHeaders(0).get('Authorization')).toBe('Bearer member-token')
    expect(requestHeaders(0).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(requestInit(0).body as string)).toEqual(input)
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost:8080/api/expenses/30')
    expect(requestInit(1).method).toBe('PATCH')
    expect(requestHeaders(1).get('Authorization')).toBe('Bearer member-token')
    expect(JSON.parse(requestInit(1).body as string)).toEqual({ ...input, note: '晚餐' })
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://localhost:8080/api/expenses/30')
    expect(requestInit(2).method).toBe('DELETE')
    expect(requestHeaders(2).get('Authorization')).toBe('Bearer member-token')
    expect(created.id).toBe(30)
    expect(updated.note).toBe('晚餐')
    expect(deleted.deleted).toBe(true)
  })
})

describe('admin API helpers', () => {
  it('fetches status and household resources with admin auth', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { serviceStatus: 'ok' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 1, name: 'Home' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 2, nickname: '小王' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 3, name: '餐饮' }] }))

    await getAdminStatus('http://localhost:8080', 'admin-token')
    await listHouseholds('http://localhost:8080', 'admin-token')
    await listMembers('http://localhost:8080', 'admin-token', 1)
    await listAdminCategories('http://localhost:8080', 'admin-token', 1)

    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://localhost:8080/admin/status')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost:8080/admin/households')
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://localhost:8080/admin/households/1/members')
    expect(fetchMock.mock.calls[3]?.[0]).toBe('http://localhost:8080/admin/households/1/categories')
    expect(requestHeaders(3).get('Authorization')).toBe('Bearer admin-token')
  })

  it('creates and updates admin-managed resources', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { id: 1, name: 'Home' } }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 1, name: 'New Home' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 2, code: 'abc' } }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 2, status: 'disabled' } }))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 2, status: 'disabled' }] }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 3, nickname: '小王', status: 'disabled' } }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 4, name: '餐饮' } }, { status: 201 }))
      .mockResolvedValueOnce(jsonResponse({ data: { id: 4, name: '晚餐' } }))

    await createHousehold('http://localhost:8080', 'admin-token', 'Home')
    await updateHousehold('http://localhost:8080', 'admin-token', 1, 'New Home')
    await createInviteCode('http://localhost:8080', 'admin-token', 1, 7)
    await disableInviteCode('http://localhost:8080', 'admin-token', 2)
    await listInviteCodes('http://localhost:8080', 'admin-token', 1)
    await updateMember('http://localhost:8080', 'admin-token', 3, { nickname: '小王', status: 'disabled' })
    await createAdminCategory('http://localhost:8080', 'admin-token', 1, {
      name: '餐饮',
      kind: 'expense',
      color: '#dc2626',
      sortOrder: 10,
    })
    await updateAdminCategory('http://localhost:8080', 'admin-token', 4, {
      name: '晚餐',
      kind: 'expense',
      color: '#dc2626',
      sortOrder: 20,
      status: 'disabled',
    })

    expect(requestInit(0).method).toBe('POST')
    expect(JSON.parse(requestInit(0).body as string)).toEqual({ name: 'Home' })
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://localhost:8080/admin/households/1')
    expect(JSON.parse(requestInit(2).body as string)).toEqual({ ttlDays: 7 })
    expect(JSON.parse(requestInit(3).body as string)).toEqual({ status: 'disabled' })
    expect(fetchMock.mock.calls[4]?.[0]).toBe('http://localhost:8080/admin/households/1/invite-codes')
    expect(JSON.parse(requestInit(5).body as string)).toEqual({ nickname: '小王', status: 'disabled' })
    expect(JSON.parse(requestInit(7).body as string)).toEqual({
      name: '晚餐',
      kind: 'expense',
      color: '#dc2626',
      sortOrder: 20,
      status: 'disabled',
    })
  })

  it('builds CSV export URLs without making a request', () => {
    expect(exportExpensesCsvUrl('http://localhost:8080/', 1, '2026-06')).toBe(
      'http://localhost:8080/admin/exports/expenses.csv?householdId=1&month=2026-06',
    )
  })

  it('downloads CSV exports with admin auth', async () => {
    fetchMock.mockResolvedValueOnce(new Response('spent_at,member\n', { status: 200 }))

    const csv = await exportExpensesCsv('http://localhost:8080', 'admin-token', 1, '2026-06')

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8080/admin/exports/expenses.csv?householdId=1&month=2026-06',
      expect.any(Object),
    )
    expect(requestHeaders(0).get('Authorization')).toBe('Bearer admin-token')
    expect(csv).toBe('spent_at,member\n')
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
  return requestHeaders(-1).get('Authorization')
}

function requestInit(index: number) {
  return fetchMock.mock.calls.at(index)?.[1] as RequestInit
}

function requestHeaders(index: number) {
  return requestInit(index).headers as Headers
}
