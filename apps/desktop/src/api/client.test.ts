import { afterEach, describe, expect, it, vi } from 'vitest'
import { request } from './client'

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

function jsonResponse(payload: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}
