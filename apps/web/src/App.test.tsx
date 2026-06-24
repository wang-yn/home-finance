/**
 * @vitest-environment jsdom
 */
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import {
  ApiError,
  adminLogin,
  createExpense,
  createHousehold,
  getAdminStatus,
  getCategories,
  getExpenses,
  getMe,
  getMonthlyAnalytics,
  health,
  joinHousehold,
  listAdminCategories,
  listHouseholdMembers,
  listHouseholds,
  listInviteCodes,
  listMembers,
} from './api/client'
import { AdminApp } from './components/AdminApp'
import { DeviceApp } from './components/DeviceApp'

type MemberSessionFixture = {
  household: ReturnType<typeof householdFixture>
  member: ReturnType<typeof memberFixture>
}

vi.mock('./api/client', () => ({
  ApiError: class ApiError extends Error {
    readonly status: number

    constructor(status: number, message: string) {
      super(message)
      this.name = 'ApiError'
      this.status = status
    }
  },
  adminLogin: vi.fn(),
  createAdminCategory: vi.fn(),
  createExpense: vi.fn(),
  createHousehold: vi.fn(),
  createInviteCode: vi.fn(),
  deleteExpense: vi.fn(),
  disableInviteCode: vi.fn(),
  exportExpensesCsv: vi.fn(),
  getAdminStatus: vi.fn(),
  getCategories: vi.fn(),
  getExpenses: vi.fn(),
  getMe: vi.fn(),
  getMonthlyAnalytics: vi.fn(),
  health: vi.fn(),
  joinHousehold: vi.fn(),
  listAdminCategories: vi.fn(),
  listHouseholdMembers: vi.fn(),
  listHouseholds: vi.fn(),
  listInviteCodes: vi.fn(),
  listMembers: vi.fn(),
  updateAdminCategory: vi.fn(),
  updateExpense: vi.fn(),
  updateHousehold: vi.fn(),
  updateMember: vi.fn(),
}))

beforeEach(() => {
  localStorage.clear()
  vi.mocked(adminLogin).mockReset()
  vi.mocked(createExpense).mockReset()
  vi.mocked(createHousehold).mockReset()
  vi.mocked(getAdminStatus).mockReset()
  vi.mocked(getCategories).mockReset()
  vi.mocked(getExpenses).mockReset()
  vi.mocked(getMe).mockReset()
  vi.mocked(getMonthlyAnalytics).mockReset()
  vi.mocked(health).mockReset()
  vi.mocked(joinHousehold).mockReset()
  vi.mocked(listAdminCategories).mockReset()
  vi.mocked(listHouseholdMembers).mockReset()
  vi.mocked(listHouseholds).mockReset()
  vi.mocked(listInviteCodes).mockReset()
  vi.mocked(listMembers).mockReset()
  vi.unstubAllGlobals()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  cleanup()
})

describe('public app shell', () => {
  it('starts at the family join entry without the old global mode switch', () => {
    render(<App />)

    expect(screen.queryByRole('tablist', { name: '应用模式' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '加入家庭账本' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '设备端' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '管理后台' })).not.toBeInTheDocument()
  })

  it('does not route unrelated admin-like paths to the admin shell', () => {
    window.history.replaceState(null, '', '/administrator')

    render(<App />)

    expect(screen.getByRole('heading', { name: '加入家庭账本' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '管理后台登录' })).not.toBeInTheDocument()
  })
})

describe('device public entry', () => {
  it('hides authenticated device navigation, month controls, metrics, and browser service settings', () => {
    render(<DeviceApp />)

    expect(screen.getByRole('heading', { name: '加入家庭账本' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '加入' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '设备端导航' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('月份')).not.toBeInTheDocument()
    expect(screen.queryByText('本月支出')).not.toBeInTheDocument()
    expect(screen.queryByText('设置')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('服务地址')).not.toBeInTheDocument()
  })

  it('shows service address setup only in app runtime', () => {
    vi.stubGlobal('isTauri', true)

    render(<DeviceApp />)

    expect(screen.getByRole('heading', { name: '加入家庭账本' })).toBeInTheDocument()
    expect(screen.getByLabelText('服务地址')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '连接' })).toBeInTheDocument()
  })

  it('returns to the public entry when an authenticated app-runtime service URL change succeeds', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('isTauri', true)
    localStorage.setItem('homeFinance.memberToken', 'member-token')
    vi.mocked(health).mockResolvedValue({ status: 'ok' })
    vi.mocked(getMe).mockResolvedValue({
      household: householdFixture(),
      member: memberFixture(),
    })
    vi.mocked(getCategories).mockResolvedValue([
      categoryFixture({ id: 3, name: '餐饮' }),
    ])
    vi.mocked(listHouseholdMembers).mockResolvedValue([])
    vi.mocked(getExpenses).mockResolvedValue([])
    vi.mocked(getMonthlyAnalytics).mockResolvedValue({
      byCategory: [],
      byMember: [],
      expenseCount: 0,
      householdId: 1,
      recentExpenses: [],
      totalCents: 0,
    })

    render(<DeviceApp />)
    await screen.findByRole('navigation', { name: '设备端导航' })
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.clear(screen.getByLabelText('服务地址'))
    await user.type(screen.getByLabelText('服务地址'), 'http://new-api.test')
    await user.click(screen.getByRole('button', { name: '保存并测试' }))

    expect(await screen.findByRole('heading', { name: '加入家庭账本' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '设备端导航' })).not.toBeInTheDocument()
    expect(localStorage.getItem('homeFinance.memberToken')).toBeNull()
    expect(localStorage.getItem('homeFinance.serviceUrl')).toBe('http://new-api.test')
  })

  it('clears device-scoped filters across a session reset', async () => {
    const user = userEvent.setup()
    localStorage.setItem('homeFinance.memberToken', 'member-token')
    vi.mocked(getMe).mockResolvedValue({
      household: householdFixture(),
      member: memberFixture(),
    })
    vi.mocked(getCategories).mockResolvedValue([
      categoryFixture({ id: 3, name: '餐饮' }),
    ])
    vi.mocked(listHouseholdMembers).mockResolvedValue([
      memberFixture({ id: 2, nickname: '小王' }),
    ])
    vi.mocked(getExpenses).mockResolvedValue([])
    vi.mocked(getMonthlyAnalytics).mockResolvedValue({
      byCategory: [],
      byMember: [],
      expenseCount: 0,
      householdId: 1,
      recentExpenses: [],
      totalCents: 0,
    })

    render(<DeviceApp />)
    await screen.findByRole('navigation', { name: '设备端导航' })
    await user.click(screen.getByRole('button', { name: '支出' }))
    const listPanel = screen.getByRole('heading', { name: '支出列表' }).closest('section')!
    await user.selectOptions(within(listPanel).getByLabelText('分类'), '3')
    await user.selectOptions(within(listPanel).getByLabelText('成员'), '2')
    await user.click(screen.getByRole('button', { name: '设置' }))
    await user.click(screen.getByRole('button', { name: '退出设备' }))

    vi.mocked(joinHousehold).mockResolvedValue({
      household: householdFixture(),
      member: memberFixture(),
      token: 'new-token',
    })
    vi.mocked(getCategories).mockResolvedValue([
      categoryFixture({ id: 4, name: '交通' }),
    ])
    vi.mocked(listHouseholdMembers).mockResolvedValue([
      memberFixture({ id: 5, nickname: '小李' }),
    ])

    await user.type(screen.getByLabelText('邀请码'), 'INVITE')
    await user.type(screen.getByLabelText('昵称'), '小李')
    await user.click(screen.getByRole('button', { name: '加入' }))

    expect(await screen.findByRole('navigation', { name: '设备端导航' })).toBeInTheDocument()
    await waitFor(() => {
      expect(getExpenses).toHaveBeenLastCalledWith(expect.any(String), 'new-token', {
        month: expect.any(String),
        categoryId: undefined,
        memberId: undefined,
      })
    })
  })

  it('keeps the public boundary while a stored member token is being validated', () => {
    localStorage.setItem('homeFinance.memberToken', 'member-token')
    vi.mocked(getMe).mockReturnValue(new Promise(() => undefined))

    render(<DeviceApp />)

    expect(screen.getByRole('heading', { name: '加入家庭账本' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '设备端导航' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('月份')).not.toBeInTheDocument()
    expect(screen.queryByText('本月支出')).not.toBeInTheDocument()
  })

  it('clears an invalid stored member token and returns to the public entry', async () => {
    localStorage.setItem('homeFinance.memberToken', 'member-token')
    vi.mocked(getMe).mockRejectedValue(new ApiError(401, 'unauthorized'))

    render(<DeviceApp />)

    expect(await screen.findByRole('heading', { name: '加入家庭账本' })).toBeInTheDocument()
    expect(localStorage.getItem('homeFinance.memberToken')).toBeNull()
    expect(screen.queryByRole('navigation', { name: '设备端导航' })).not.toBeInTheDocument()
  })

  it('runs only one initial device refresh after a stored member token validates', async () => {
    localStorage.setItem('homeFinance.memberToken', 'member-token')
    vi.mocked(getMe).mockResolvedValue({
      household: householdFixture(),
      member: memberFixture(),
    })
    vi.mocked(getCategories).mockResolvedValue([])
    vi.mocked(listHouseholdMembers).mockResolvedValue([])
    vi.mocked(getExpenses).mockResolvedValue([])
    vi.mocked(getMonthlyAnalytics).mockResolvedValue({
      byCategory: [],
      byMember: [],
      expenseCount: 0,
      householdId: 1,
      recentExpenses: [],
      totalCents: 0,
    })

    render(<DeviceApp />)

    expect(await screen.findByRole('navigation', { name: '设备端导航' })).toBeInTheDocument()
    await waitFor(() => expect(getMonthlyAnalytics).toHaveBeenCalledTimes(1))
    expect(getMe).toHaveBeenCalledTimes(1)
    expect(getCategories).toHaveBeenCalledTimes(1)
    expect(listHouseholdMembers).toHaveBeenCalledTimes(1)
    expect(getExpenses).toHaveBeenCalledTimes(1)
  })

  it('refreshes device data after authenticated month and filter changes', async () => {
    const user = userEvent.setup()
    localStorage.setItem('homeFinance.memberToken', 'member-token')
    vi.mocked(getMe).mockResolvedValue({
      household: householdFixture(),
      member: memberFixture(),
    })
    vi.mocked(getCategories).mockResolvedValue([
      categoryFixture({ id: 3, name: '餐饮' }),
    ])
    vi.mocked(listHouseholdMembers).mockResolvedValue([
      memberFixture({ id: 2, nickname: '小王' }),
    ])
    vi.mocked(getExpenses).mockResolvedValue([])
    vi.mocked(getMonthlyAnalytics).mockResolvedValue({
      byCategory: [],
      byMember: [],
      expenseCount: 0,
      householdId: 1,
      recentExpenses: [],
      totalCents: 0,
    })

    render(<DeviceApp />)
    await screen.findByRole('navigation', { name: '设备端导航' })
    await waitFor(() => expect(getExpenses).toHaveBeenCalledTimes(1))

    await user.clear(screen.getByLabelText('月份'))
    await user.type(screen.getByLabelText('月份'), '2026-05')

    await waitFor(() => expect(getMonthlyAnalytics).toHaveBeenLastCalledWith(expect.any(String), 'member-token', '2026-05'))

    await user.click(screen.getByRole('button', { name: '支出' }))
    const listPanel = screen.getByRole('heading', { name: '支出列表' }).closest('section')!
    await user.selectOptions(within(listPanel).getByLabelText('分类'), '3')
    await user.selectOptions(within(listPanel).getByLabelText('成员'), '2')

    await waitFor(() => {
      expect(getExpenses).toHaveBeenLastCalledWith(expect.any(String), 'member-token', {
        categoryId: 3,
        memberId: 2,
        month: '2026-05',
      })
    })
  })

  it('enters the authenticated device shell when token validation succeeds even if hydration fails', async () => {
    localStorage.setItem('homeFinance.memberToken', 'member-token')
    vi.mocked(getMe).mockResolvedValue({
      household: householdFixture(),
      member: memberFixture(),
    })
    vi.mocked(getCategories).mockRejectedValue(new Error('categories unavailable'))

    render(<DeviceApp />)

    expect(await screen.findByRole('navigation', { name: '设备端导航' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '小王 的家庭账本' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('categories unavailable')
    expect(localStorage.getItem('homeFinance.memberToken')).toBe('member-token')
  })

  it('returns to the public entry when an authenticated expense action gets a current-token 401', async () => {
    const user = userEvent.setup()
    localStorage.setItem('homeFinance.memberToken', 'member-token')
    vi.mocked(getMe).mockResolvedValue({
      household: householdFixture(),
      member: memberFixture(),
    })
    vi.mocked(getCategories).mockResolvedValue([
      categoryFixture({ id: 3, name: '餐饮' }),
    ])
    vi.mocked(listHouseholdMembers).mockResolvedValue([])
    vi.mocked(getExpenses).mockResolvedValue([])
    vi.mocked(getMonthlyAnalytics).mockResolvedValue({
      byCategory: [],
      byMember: [],
      expenseCount: 0,
      householdId: 1,
      recentExpenses: [],
      totalCents: 0,
    })
    vi.mocked(createExpense).mockRejectedValue(new ApiError(401, 'unauthorized'))

    render(<DeviceApp />)
    await screen.findByRole('navigation', { name: '设备端导航' })
    await user.click(screen.getByRole('button', { name: '支出' }))
    const expenseForm = screen.getByRole('heading', { name: '记录支出' }).closest('section')!
    await user.type(screen.getByPlaceholderText('0.00'), '12.5')
    await user.selectOptions(within(expenseForm).getByLabelText('分类'), '3')
    await user.click(within(expenseForm).getByRole('button', { name: '记录' }))

    expect(await screen.findByRole('heading', { name: '加入家庭账本' })).toBeInTheDocument()
    expect(localStorage.getItem('homeFinance.memberToken')).toBeNull()
    expect(screen.queryByRole('navigation', { name: '设备端导航' })).not.toBeInTheDocument()
  })

  it('loads authenticated device data once after a fresh join succeeds', async () => {
    const user = userEvent.setup()
    vi.mocked(joinHousehold).mockResolvedValue({
      household: householdFixture(),
      member: memberFixture(),
      token: 'new-token',
    })
    vi.mocked(getMe).mockResolvedValue({
      household: householdFixture(),
      member: memberFixture(),
    })
    vi.mocked(getCategories).mockResolvedValue([
      categoryFixture({ id: 3, name: '餐饮' }),
    ])
    vi.mocked(listHouseholdMembers).mockResolvedValue([memberFixture()])
    vi.mocked(getExpenses).mockResolvedValue([])
    vi.mocked(getMonthlyAnalytics).mockResolvedValue({
      byCategory: [],
      byMember: [],
      expenseCount: 0,
      householdId: 1,
      recentExpenses: [],
      totalCents: 0,
    })

    render(<DeviceApp />)
    await user.type(screen.getByLabelText('邀请码'), 'INVITE')
    await user.type(screen.getByLabelText('昵称'), '小王')
    await user.click(screen.getByRole('button', { name: '加入' }))

    expect(await screen.findByRole('navigation', { name: '设备端导航' })).toBeInTheDocument()
    await waitFor(() => expect(getMonthlyAnalytics).toHaveBeenCalledTimes(1))
    expect(getMe).not.toHaveBeenCalled()
    expect(getCategories).toHaveBeenCalledTimes(1)
    expect(listHouseholdMembers).toHaveBeenCalledTimes(1)
    expect(getExpenses).toHaveBeenCalledTimes(1)
  })

  it('ignores an old member-token validation failure after a new join succeeds', async () => {
    const user = userEvent.setup()
    localStorage.setItem('homeFinance.memberToken', 'old-token')
    const oldValidation = deferred<never>()
    vi.mocked(getMe)
      .mockReturnValueOnce(oldValidation.promise)
      .mockResolvedValue({
        household: householdFixture(),
        member: memberFixture(),
      })
    vi.mocked(joinHousehold).mockResolvedValue({
      household: householdFixture(),
      member: memberFixture(),
      token: 'new-token',
    })
    vi.mocked(getCategories).mockResolvedValue([])
    vi.mocked(listHouseholdMembers).mockResolvedValue([])
    vi.mocked(getExpenses).mockResolvedValue([])
    vi.mocked(getMonthlyAnalytics).mockResolvedValue({
      byCategory: [],
      byMember: [],
      expenseCount: 0,
      householdId: 1,
      recentExpenses: [],
      totalCents: 0,
    })

    render(<DeviceApp />)
    await user.type(screen.getByLabelText('邀请码'), 'INVITE')
    await user.type(screen.getByLabelText('昵称'), '小王')
    await user.click(screen.getByRole('button', { name: '加入' }))

    expect(await screen.findByRole('navigation', { name: '设备端导航' })).toBeInTheDocument()

    oldValidation.reject(new ApiError(401, 'unauthorized'))

    await waitFor(() => expect(localStorage.getItem('homeFinance.memberToken')).toBe('new-token'))
    expect(screen.getByRole('navigation', { name: '设备端导航' })).toBeInTheDocument()
    expect(screen.queryByText('unauthorized')).not.toBeInTheDocument()
  })

  it('ignores an old member-token validation success after a new join succeeds', async () => {
    const user = userEvent.setup()
    localStorage.setItem('homeFinance.memberToken', 'old-token')
    const oldValidation = deferred<MemberSessionFixture>()
    vi.mocked(getMe)
      .mockReturnValueOnce(oldValidation.promise)
      .mockResolvedValue({
        household: householdFixture(),
        member: memberFixture(),
      })
    vi.mocked(joinHousehold).mockResolvedValue({
      household: householdFixture(),
      member: memberFixture(),
      token: 'new-token',
    })
    vi.mocked(getCategories).mockResolvedValue([])
    vi.mocked(listHouseholdMembers).mockResolvedValue([])
    vi.mocked(getExpenses).mockResolvedValue([])
    vi.mocked(getMonthlyAnalytics).mockResolvedValue({
      byCategory: [],
      byMember: [],
      expenseCount: 0,
      householdId: 1,
      recentExpenses: [],
      totalCents: 0,
    })

    render(<DeviceApp />)
    await user.type(screen.getByLabelText('邀请码'), 'INVITE')
    await user.type(screen.getByLabelText('昵称'), '小王')
    await user.click(screen.getByRole('button', { name: '加入' }))

    expect(await screen.findByRole('heading', { name: '小王 的家庭账本' })).toBeInTheDocument()

    oldValidation.resolve({
      household: householdFixture({ name: '旧家庭' }),
      member: memberFixture({ nickname: '旧成员' }),
    })

    await waitFor(() => expect(screen.getByRole('heading', { name: '小王 的家庭账本' })).toBeInTheDocument())
    expect(screen.queryByRole('heading', { name: '旧成员 的家庭账本' })).not.toBeInTheDocument()
  })
})

describe('admin public entry', () => {
  it('renders only the admin login panel before authentication', () => {
    render(<AdminApp />)

    expect(screen.getByRole('heading', { name: '管理后台登录' })).toBeInTheDocument()
    expect(screen.getByLabelText('管理密码')).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '后台导航' })).not.toBeInTheDocument()
    expect(screen.queryByText('服务')).not.toBeInTheDocument()
    expect(screen.queryByText('家庭')).not.toBeInTheDocument()
    expect(screen.queryByText('邀请码')).not.toBeInTheDocument()
  })

  it('uses a side navigation only after an admin token is validated', async () => {
    localStorage.setItem('homeFinance.adminToken', 'admin-token')
    vi.mocked(getAdminStatus).mockResolvedValue({
      dbPath: 'home.db',
      expenseCount: 0,
      householdCount: 0,
      memberCount: 0,
      serviceStatus: 'ok',
    })
    vi.mocked(listHouseholds).mockResolvedValue([])

    render(<AdminApp />)

    const nav = await screen.findByRole('navigation', { name: '后台导航' })
    expect(within(nav).getByRole('button', { name: '状态' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: '管理后台登录' })).not.toBeInTheDocument()
  })

  it('enters the authenticated admin shell when token validation succeeds even if household hydration fails', async () => {
    localStorage.setItem('homeFinance.adminToken', 'admin-token')
    vi.mocked(getAdminStatus).mockResolvedValue(adminStatusFixture())
    vi.mocked(listHouseholds).mockRejectedValue(new Error('households unavailable'))

    render(<AdminApp />)

    expect(await screen.findByRole('navigation', { name: '后台导航' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('households unavailable')
    expect(localStorage.getItem('homeFinance.adminToken')).toBe('admin-token')
  })

  it('keeps the login boundary while a stored admin token is being validated', () => {
    localStorage.setItem('homeFinance.adminToken', 'admin-token')
    vi.mocked(getAdminStatus).mockReturnValue(new Promise(() => undefined))

    render(<AdminApp />)

    expect(screen.getByRole('heading', { name: '管理后台登录' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: '后台导航' })).not.toBeInTheDocument()
    expect(screen.queryByText('服务')).not.toBeInTheDocument()
  })

  it('clears an invalid stored admin token and returns to the login panel', async () => {
    localStorage.setItem('homeFinance.adminToken', 'admin-token')
    vi.mocked(getAdminStatus).mockRejectedValue(new ApiError(401, 'unauthorized'))

    render(<AdminApp />)

    expect(await screen.findByRole('heading', { name: '管理后台登录' })).toBeInTheDocument()
    expect(localStorage.getItem('homeFinance.adminToken')).toBeNull()
    expect(screen.queryByRole('navigation', { name: '后台导航' })).not.toBeInTheDocument()
  })

  it('runs only one initial admin refresh after a stored admin token validates', async () => {
    localStorage.setItem('homeFinance.adminToken', 'admin-token')
    vi.mocked(getAdminStatus).mockResolvedValue(adminStatusFixture())
    vi.mocked(listHouseholds).mockResolvedValue([])

    render(<AdminApp />)

    expect(await screen.findByRole('navigation', { name: '后台导航' })).toBeInTheDocument()
    await waitFor(() => expect(getAdminStatus).toHaveBeenCalledTimes(2))
    expect(listHouseholds).toHaveBeenCalledTimes(1)
  })

  it('returns to the login panel when an authenticated admin action gets a current-token 401', async () => {
    const user = userEvent.setup()
    localStorage.setItem('homeFinance.adminToken', 'admin-token')
    vi.mocked(getAdminStatus).mockResolvedValue(adminStatusFixture())
    vi.mocked(listHouseholds).mockResolvedValue([])
    vi.mocked(createHousehold).mockRejectedValue(new ApiError(401, 'unauthorized'))

    render(<AdminApp />)
    await screen.findByRole('navigation', { name: '后台导航' })
    await user.click(screen.getByRole('button', { name: '家庭' }))
    await user.type(screen.getByLabelText('家庭名称'), '新家庭')
    await user.click(screen.getByRole('button', { name: '创建' }))

    expect(await screen.findByRole('heading', { name: '管理后台登录' })).toBeInTheDocument()
    expect(localStorage.getItem('homeFinance.adminToken')).toBeNull()
    expect(screen.queryByRole('navigation', { name: '后台导航' })).not.toBeInTheDocument()
  })

  it('clears selected household across an admin session reset', async () => {
    const user = userEvent.setup()
    localStorage.setItem('homeFinance.adminToken', 'admin-token')
    vi.mocked(getAdminStatus).mockResolvedValue(adminStatusFixture())
    vi.mocked(listHouseholds).mockResolvedValue([
      householdFixture({ id: 1, name: '旧家庭一' }),
      householdFixture({ id: 2, name: '旧家庭二' }),
    ])
    vi.mocked(listMembers).mockResolvedValue([])
    vi.mocked(listAdminCategories).mockResolvedValue([])
    vi.mocked(listInviteCodes).mockResolvedValue([])

    render(<AdminApp />)
    await screen.findByRole('navigation', { name: '后台导航' })
    await waitFor(() => expect(listMembers).toHaveBeenLastCalledWith(expect.any(String), 'admin-token', 1))
    await user.click(screen.getByRole('button', { name: '家庭' }))
    const secondHouseholdRow = screen.getByText('旧家庭二').closest('article')!
    await user.click(within(secondHouseholdRow).getByRole('button', { name: '选择' }))
    await waitFor(() => expect(listMembers).toHaveBeenLastCalledWith(expect.any(String), 'admin-token', 2))
    await user.click(screen.getByRole('button', { name: '退出后台' }))

    vi.mocked(adminLogin).mockResolvedValue({ token: 'new-admin-token' })
    vi.mocked(listHouseholds).mockResolvedValue([
      householdFixture({ id: 7, name: '新家庭' }),
    ])

    await user.type(screen.getByLabelText('管理密码'), 'secret')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByRole('navigation', { name: '后台导航' })).toBeInTheDocument()
    await waitFor(() => expect(listMembers).toHaveBeenLastCalledWith(expect.any(String), 'new-admin-token', 7))
  })

  it('ignores stale admin household-scope results after logout', async () => {
    const user = userEvent.setup()
    localStorage.setItem('homeFinance.adminToken', 'admin-token')
    vi.mocked(getAdminStatus).mockResolvedValue(adminStatusFixture())
    vi.mocked(listHouseholds).mockResolvedValue([
      householdFixture({ id: 1, name: '旧家庭一' }),
      householdFixture({ id: 2, name: '旧家庭二' }),
    ])
    vi.mocked(listMembers).mockResolvedValueOnce([])
    vi.mocked(listAdminCategories).mockResolvedValueOnce([])
    vi.mocked(listInviteCodes).mockResolvedValueOnce([])
    const staleMembers = deferred<Awaited<ReturnType<typeof listMembers>>>()
    const staleCategories = deferred<Awaited<ReturnType<typeof listAdminCategories>>>()
    const staleInviteCodes = deferred<Awaited<ReturnType<typeof listInviteCodes>>>()
    vi.mocked(listMembers).mockReturnValueOnce(staleMembers.promise)
    vi.mocked(listAdminCategories).mockReturnValueOnce(staleCategories.promise)
    vi.mocked(listInviteCodes).mockReturnValueOnce(staleInviteCodes.promise)

    render(<AdminApp />)
    await screen.findByRole('navigation', { name: '后台导航' })
    await waitFor(() => expect(listMembers).toHaveBeenLastCalledWith(expect.any(String), 'admin-token', 1))
    await user.click(screen.getByRole('button', { name: '家庭' }))
    const secondHouseholdRow = screen.getByText('旧家庭二').closest('article')!
    await user.click(within(secondHouseholdRow).getByRole('button', { name: '选择' }))
    await waitFor(() => expect(listMembers).toHaveBeenLastCalledWith(expect.any(String), 'admin-token', 2))
    await user.click(screen.getByRole('button', { name: '退出后台' }))

    staleMembers.resolve([memberFixture({ nickname: '不应显示成员' })])
    staleCategories.resolve([categoryFixture({ name: '不应显示分类' })])
    staleInviteCodes.resolve([])

    expect(await screen.findByRole('heading', { name: '管理后台登录' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('不应显示成员')).not.toBeInTheDocument())
    expect(screen.queryByText('不应显示分类')).not.toBeInTheDocument()
  })

  it('refreshes admin status after a household mutation succeeds', async () => {
    const user = userEvent.setup()
    localStorage.setItem('homeFinance.adminToken', 'admin-token')
    vi.mocked(getAdminStatus)
      .mockResolvedValueOnce(adminStatusFixture({ householdCount: 0 }))
      .mockResolvedValue(adminStatusFixture({ householdCount: 1 }))
    vi.mocked(listHouseholds).mockResolvedValue([])
    vi.mocked(createHousehold).mockResolvedValue(householdFixture({ id: 2, name: '新家庭' }))

    render(<AdminApp />)
    await screen.findByRole('navigation', { name: '后台导航' })
    await user.click(screen.getByRole('button', { name: '家庭' }))
    await user.type(screen.getByLabelText('家庭名称'), '新家庭')
    await user.click(screen.getByRole('button', { name: '创建' }))
    await user.click(screen.getByRole('button', { name: '状态' }))

    await waitFor(() => expect(screen.getByText('1')).toBeInTheDocument())
    expect(getAdminStatus).toHaveBeenCalledTimes(3)
  })

  it('loads authenticated admin data once after a fresh login succeeds', async () => {
    const user = userEvent.setup()
    vi.mocked(adminLogin).mockResolvedValue({ token: 'new-token' })
    vi.mocked(getAdminStatus).mockResolvedValue(adminStatusFixture({ householdCount: 1 }))
    vi.mocked(listHouseholds).mockResolvedValue([
      householdFixture({ id: 1, name: '当前家庭' }),
    ])
    vi.mocked(listHouseholdMembers).mockResolvedValue([])
    vi.mocked(listAdminCategories).mockResolvedValue([])
    vi.mocked(listInviteCodes).mockResolvedValue([])

    render(<AdminApp />)
    await user.type(screen.getByLabelText('管理密码'), 'secret')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByRole('navigation', { name: '后台导航' })).toBeInTheDocument()
    await waitFor(() => expect(listInviteCodes).toHaveBeenCalledTimes(1))
    expect(getAdminStatus).toHaveBeenCalledTimes(2)
    expect(listHouseholds).toHaveBeenCalledTimes(1)
    expect(listMembers).toHaveBeenCalledTimes(1)
    expect(listAdminCategories).toHaveBeenCalledTimes(1)
    expect(listInviteCodes).toHaveBeenCalledTimes(1)
  })

  it('ignores an old admin-token validation failure after a new login succeeds', async () => {
    const user = userEvent.setup()
    localStorage.setItem('homeFinance.adminToken', 'old-token')
    const oldValidation = deferred<never>()
    vi.mocked(getAdminStatus)
      .mockReturnValueOnce(oldValidation.promise)
      .mockResolvedValue(adminStatusFixture())
    vi.mocked(adminLogin).mockResolvedValue({ token: 'new-token' })
    vi.mocked(listHouseholds).mockResolvedValue([])

    render(<AdminApp />)
    await user.type(screen.getByLabelText('管理密码'), 'secret')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByRole('navigation', { name: '后台导航' })).toBeInTheDocument()

    oldValidation.reject(new ApiError(401, 'unauthorized'))

    await waitFor(() => expect(localStorage.getItem('homeFinance.adminToken')).toBe('new-token'))
    expect(screen.getByRole('navigation', { name: '后台导航' })).toBeInTheDocument()
    expect(screen.queryByText('unauthorized')).not.toBeInTheDocument()
  })

  it('ignores an old admin-token validation success after a new login succeeds', async () => {
    const user = userEvent.setup()
    localStorage.setItem('homeFinance.adminToken', 'old-token')
    const oldValidation = deferred<ReturnType<typeof adminStatusFixture>>()
    vi.mocked(getAdminStatus)
      .mockReturnValueOnce(oldValidation.promise)
      .mockResolvedValue(adminStatusFixture())
    vi.mocked(adminLogin).mockResolvedValue({ token: 'new-token' })
    vi.mocked(listHouseholds).mockResolvedValue([])

    render(<AdminApp />)
    await user.type(screen.getByLabelText('管理密码'), 'secret')
    await user.click(screen.getByRole('button', { name: '登录' }))

    expect(await screen.findByRole('navigation', { name: '后台导航' })).toBeInTheDocument()

    oldValidation.resolve(adminStatusFixture({ dbPath: 'old.db' }))

    await waitFor(() => expect(screen.queryByText('old.db')).not.toBeInTheDocument())
  })
})

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, reject, resolve }
}

function adminStatusFixture(overrides: Partial<{
  dbPath: string
  expenseCount: number
  householdCount: number
  memberCount: number
  serviceStatus: string
}> = {}) {
  return {
    dbPath: 'home.db',
    expenseCount: 0,
    householdCount: 0,
    memberCount: 0,
    serviceStatus: 'ok',
    ...overrides,
  }
}

function householdFixture(overrides: Partial<{
  createdAt: string
  id: number
  name: string
  status: string
  updatedAt: string
}> = {}) {
  return {
    createdAt: '2026-06-24T00:00:00.000Z',
    id: 1,
    name: '家',
    status: 'active',
    updatedAt: '2026-06-24T00:00:00.000Z',
    ...overrides,
  }
}

function categoryFixture(overrides: Partial<{
  color: string
  createdAt: string
  householdId: number
  id: number
  kind: string
  name: string
  sortOrder: number
  status: string
  updatedAt: string
}> = {}) {
  return {
    color: '#64748b',
    createdAt: '2026-06-24T00:00:00.000Z',
    householdId: 1,
    id: 1,
    kind: 'expense',
    name: '餐饮',
    sortOrder: 10,
    status: 'active',
    updatedAt: '2026-06-24T00:00:00.000Z',
    ...overrides,
  }
}

function memberFixture(overrides: Partial<{
  createdAt: string
  householdId: number
  id: number
  nickname: string
  status: string
}> = {}) {
  return {
    createdAt: '2026-06-24T00:00:00.000Z',
    householdId: 1,
    id: 2,
    nickname: '小王',
    status: 'active',
    ...overrides,
  }
}
