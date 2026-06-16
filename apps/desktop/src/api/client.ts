import type {
  AdminLoginResult,
  AnalyticsSummary,
  ApiEnvelope,
  Category,
  DeleteExpenseResult,
  Expense,
  ExpenseInput,
  JoinResult,
  MemberSession,
} from './types'

type RequestOptions = RequestInit & {
  token?: string
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function request<T>(baseUrl: string, path: string, options: RequestOptions = {}) {
  const { headers, token, ...init } = options
  const requestHeaders = new Headers(headers)
  if (init.body && !requestHeaders.has('Content-Type')) {
    requestHeaders.set('Content-Type', 'application/json')
  }
  if (token) {
    requestHeaders.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${trimTrailingSlash(baseUrl)}${path}`, {
    ...init,
    headers: requestHeaders,
  })

  if (!response.ok) {
    throw new ApiError(response.status, await responseErrorMessage(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function health(baseUrl: string) {
  return request<{ status: string }>(baseUrl, '/health')
}

export async function adminLogin(baseUrl: string, password: string) {
  const payload = await request<ApiEnvelope<AdminLoginResult>>(baseUrl, '/admin/login', {
    method: 'POST',
    body: JSON.stringify({ password }),
  })
  return payload.data
}

export async function joinHousehold(baseUrl: string, inviteCode: string, nickname: string) {
  const payload = await request<ApiEnvelope<JoinResult>>(baseUrl, '/api/join', {
    method: 'POST',
    body: JSON.stringify({ inviteCode, nickname }),
  })
  return payload.data
}

export async function getMe(baseUrl: string, token: string) {
  const payload = await request<ApiEnvelope<MemberSession>>(baseUrl, '/api/me', { token })
  return payload.data
}

export async function getCategories(baseUrl: string, token: string) {
  const payload = await request<ApiEnvelope<Category[]>>(baseUrl, '/api/categories', { token })
  return payload.data
}

export async function getExpenses(baseUrl: string, token: string, month?: string) {
  const payload = await request<ApiEnvelope<Expense[]>>(baseUrl, `/api/expenses${monthQuery(month)}`, { token })
  return payload.data
}

export async function createExpense(baseUrl: string, token: string, input: ExpenseInput) {
  const payload = await request<ApiEnvelope<Expense>>(baseUrl, '/api/expenses', {
    method: 'POST',
    token,
    body: JSON.stringify(input),
  })
  return payload.data
}

export async function updateExpense(baseUrl: string, token: string, expenseID: number, input: ExpenseInput) {
  const payload = await request<ApiEnvelope<Expense>>(baseUrl, `/api/expenses/${expenseID}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(input),
  })
  return payload.data
}

export async function deleteExpense(baseUrl: string, token: string, expenseID: number) {
  const payload = await request<ApiEnvelope<DeleteExpenseResult>>(baseUrl, `/api/expenses/${expenseID}`, {
    method: 'DELETE',
    token,
  })
  return payload.data
}

export async function getMonthlyAnalytics(baseUrl: string, token: string, month: string) {
  const payload = await request<ApiEnvelope<AnalyticsSummary>>(
    baseUrl,
    `/api/analytics/monthly${monthQuery(month)}`,
    { token },
  )
  return payload.data
}

async function responseErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { error?: string }
    return payload.error || `HTTP ${response.status}`
  } catch {
    return `HTTP ${response.status}`
  }
}

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

function monthQuery(month?: string) {
  if (!month) {
    return ''
  }
  return `?month=${encodeURIComponent(month)}`
}
