import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ApiError,
  createExpense,
  deleteExpense,
  getCategories,
  getExpenses,
  getMe,
  getMonthlyAnalytics,
  health,
  joinHousehold,
  listHouseholdMembers,
  updateExpense,
} from '../api/client'
import type { AnalyticsSummary, Category, Expense, ExpenseInput, Member, MemberSession } from '../api/types'
import {
  clearMemberToken,
  loadMemberToken,
  loadServiceUrl,
  saveMemberToken,
  saveServiceUrl,
} from '../storage/session'
import { isAppRuntime } from '../platform'
import { formatCents, formatMonth, fromLocalDateTimeInput, toLocalDateTimeInput } from '../utils/format'

type View = 'overview' | 'expenses' | 'analysis' | 'settings'

type ExpenseForm = {
  categoryId: string
  amount: string
  currency: string
  note: string
  spentAt: string
}

function createInitialExpenseForm(categoryId = ''): ExpenseForm {
  return {
    categoryId,
    amount: '',
    currency: 'CNY',
    note: '',
    spentAt: toLocalDateTimeInput(new Date()),
  }
}

export function DeviceApp() {
  const appRuntime = isAppRuntime()
  const [activeServiceUrl, setActiveServiceUrl] = useState(loadServiceUrl)
  const [serviceUrlDraft, setServiceUrlDraft] = useState(activeServiceUrl)
  const [token, setToken] = useState(loadMemberToken)
  const [validatedToken, setValidatedToken] = useState<string | null>(null)
  const [view, setView] = useState<View>('overview')
  const [session, setSession] = useState<MemberSession | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [month, setMonth] = useState(formatMonth(new Date()))
  const [categoryFilter, setCategoryFilter] = useState('')
  const [memberFilter, setMemberFilter] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(() => createInitialExpenseForm())
  const [editingID, setEditingID] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const categoryByID = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])
  const memberByID = useMemo(() => new Map(members.map((member) => [member.id, member])), [members])

  const logout = useCallback(() => {
    clearMemberToken()
    setToken(null)
    setValidatedToken(null)
    setSession(null)
    setCategories([])
    setMembers([])
    setExpenses([])
    setAnalytics(null)
    setCategoryFilter('')
    setMemberFilter('')
    setExpenseForm(createInitialExpenseForm())
    setEditingID(null)
    setView('overview')
    setStatus('')
    setError('')
  }, [])

  const handleError = useCallback((nextError: unknown) => {
    setError(nextError instanceof Error ? nextError.message : '请求失败')
  }, [])

  const handleAuthenticatedError = useCallback((nextError: unknown, requestToken: string) => {
    handleError(nextError)
    if (nextError instanceof ApiError && nextError.status === 401 && loadMemberToken() === requestToken) {
      logout()
    }
  }, [handleError, logout])

  const validateToken = useCallback(async (currentToken = token) => {
    if (!currentToken) {
      return
    }
    const isCurrentToken = () => loadMemberToken() === currentToken
    setError('')
    try {
      const nextSession = await getMe(activeServiceUrl, currentToken)
      if (!isCurrentToken()) {
        return
      }
      setSession(nextSession)
      setValidatedToken(currentToken)
    } catch (nextError) {
      if (!isCurrentToken()) {
        return
      }
      handleAuthenticatedError(nextError, currentToken)
    }
  }, [activeServiceUrl, handleAuthenticatedError, token])

  const refreshData = useCallback(async (currentToken = token, currentSession = session) => {
    if (!currentToken || !currentSession) {
      return
    }
    const isCurrentToken = () => loadMemberToken() === currentToken
    setLoading(true)
    setError('')
    try {
      const filter = {
        month,
        categoryId: Number(categoryFilter) || undefined,
        memberId: Number(memberFilter) || undefined,
      }
      const [nextCategories, nextMembers, nextExpenses, nextAnalytics] = await Promise.all([
        getCategories(activeServiceUrl, currentToken),
        listHouseholdMembers(activeServiceUrl, currentToken, currentSession.household.id),
        getExpenses(activeServiceUrl, currentToken, filter),
        getMonthlyAnalytics(activeServiceUrl, currentToken, month),
      ])
      if (!isCurrentToken()) {
        return
      }
      setCategories(nextCategories)
      setMembers(nextMembers)
      setExpenses(nextExpenses)
      setAnalytics(nextAnalytics)
    } catch (nextError) {
      if (!isCurrentToken()) {
        return
      }
      handleAuthenticatedError(nextError, currentToken)
    } finally {
      setLoading(false)
    }
  }, [activeServiceUrl, categoryFilter, handleAuthenticatedError, memberFilter, month, session, token])

  useEffect(() => {
    if (!token || validatedToken === token) {
      return
    }
    void Promise.resolve().then(() => validateToken(token))
  }, [token, validateToken, validatedToken])

  useEffect(() => {
    if (!token || validatedToken !== token || !session) {
      return
    }
    void Promise.resolve().then(() => refreshData(token, session))
  }, [refreshData, session, token, validatedToken])

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await health(serviceUrlDraft)
      const serviceUrlChanged = serviceUrlDraft !== activeServiceUrl
      saveServiceUrl(serviceUrlDraft)
      setActiveServiceUrl(serviceUrlDraft)
      if (serviceUrlChanged && token) {
        logout()
      }
      setStatus('服务已连接')
    } catch (nextError) {
      handleError(nextError)
    } finally {
      setLoading(false)
    }
  }

  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await joinHousehold(activeServiceUrl, inviteCode.trim(), nickname.trim())
      saveServiceUrl(activeServiceUrl)
      saveMemberToken(result.token)
      setToken(result.token)
      setSession({ household: result.household, member: result.member })
      setValidatedToken(result.token)
      setStatus('已加入家庭')
      setView('overview')
    } catch (nextError) {
      handleError(nextError)
    } finally {
      setLoading(false)
    }
  }

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!token) {
      setError('请先加入家庭')
      return
    }
    const input = buildExpenseInput(expenseForm)
    if (!input) {
      setError('请填写金额、分类和时间')
      return
    }
    setLoading(true)
    setError('')
    try {
      if (editingID) {
        await updateExpense(activeServiceUrl, token, editingID, input)
        setStatus('支出已更新')
      } else {
        await createExpense(activeServiceUrl, token, input)
        setStatus('支出已记录')
      }
      setExpenseForm(createInitialExpenseForm(expenseForm.categoryId))
      setEditingID(null)
      await refreshData(token)
      setView('expenses')
    } catch (nextError) {
      handleAuthenticatedError(nextError, token)
    } finally {
      setLoading(false)
    }
  }

  async function removeExpense(expenseID: number) {
    if (!token) {
      return
    }
    setLoading(true)
    setError('')
    try {
      await deleteExpense(activeServiceUrl, token, expenseID)
      setStatus('支出已删除')
      await refreshData(token)
    } catch (nextError) {
      handleAuthenticatedError(nextError, token)
    } finally {
      setLoading(false)
    }
  }

  function editExpense(expense: Expense) {
    setEditingID(expense.id)
    setExpenseForm({
      categoryId: String(expense.categoryId),
      amount: (expense.amountCents / 100).toFixed(2),
      currency: expense.currency,
      note: expense.note,
      spentAt: toLocalDateTimeInput(expense.spentAt),
    })
    setView('expenses')
  }

  if (!token || validatedToken !== token || !session) {
    return (
      <main className="app-shell public-shell">
        <section className="public-entry" aria-labelledby="device-public-title">
          <p className="eyebrow">家庭账本</p>
          <h1 id="device-public-title">加入家庭账本</h1>
          <p className="entry-copy">输入家人分享的邀请码，开始记录家庭支出。</p>

          {error && <p className="error" role="alert">{error}</p>}
          {status && !error && <p className="status" aria-live="polite">{status}</p>}

          {appRuntime && (
            <form className="form-grid service-panel" onSubmit={connect}>
              <label>
                <span>服务地址</span>
                <input value={serviceUrlDraft} onChange={(event) => setServiceUrlDraft(event.target.value)} />
              </label>
              <button type="submit" className="secondary" disabled={loading}>连接</button>
            </form>
          )}

          <form className="form-grid" onSubmit={join}>
            <label>
              <span>邀请码</span>
              <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} />
            </label>
            <label>
              <span>昵称</span>
              <input value={nickname} onChange={(event) => setNickname(event.target.value)} />
            </label>
            <button type="submit" disabled={loading}>加入</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">{session?.household.name || 'Home Finance'}</p>
            <h1>{session ? `${session.member.nickname} 的家庭账本` : '连接家庭账本服务'}</h1>
          </div>
          <label className="month-control">
            <span>月份</span>
            <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </label>
        </header>

        <nav className="mobile-nav" aria-label="设备端导航">
          {(['overview', 'expenses', 'analysis', 'settings'] as View[]).map((item) => (
            <button
              type="button"
              key={item}
              className={view === item ? 'active' : ''}
              onClick={() => setView(item)}
            >
              {viewLabel(item)}
            </button>
          ))}
        </nav>

        {error && <p className="error" role="alert">{error}</p>}
        {status && !error && <p className="status" aria-live="polite">{status}</p>}

        {view === 'overview' && (
          <section className="metric-grid">
            <article className="metric">
              <span>本月支出</span>
              <strong>{formatCents(analytics?.totalCents || 0)}</strong>
              <p>{analytics?.expenseCount || 0} 笔记录</p>
            </article>
            <article className="metric">
              <span>分类</span>
              <strong>{categories.length}</strong>
              <p>可用于记账</p>
            </article>
            <article className="metric">
              <span>最近记录</span>
              <strong>{expenses.length}</strong>
              <p>{month}</p>
            </article>
          </section>
        )}

        {view === 'expenses' && (
          <section className="content-grid">
            <ExpenseFormPanel
              categories={categories}
              editingID={editingID}
              form={expenseForm}
              loading={loading}
              onCancel={() => {
                setEditingID(null)
                setExpenseForm(createInitialExpenseForm())
              }}
              onChange={setExpenseForm}
              onSubmit={submitExpense}
            />
            <ExpenseList
              categoryByID={categoryByID}
              expenses={expenses}
              memberByID={memberByID}
              members={members}
              categoryFilter={categoryFilter}
              categories={categories}
              memberFilter={memberFilter}
              onDelete={removeExpense}
              onEdit={editExpense}
              onCategoryFilter={setCategoryFilter}
              onMemberFilter={setMemberFilter}
            />
          </section>
        )}

        {view === 'analysis' && (
          <section className="panel">
            <div className="panel-header">
              <h2>月度分析</h2>
              <span>{month}</span>
            </div>
            <div className="metric-grid compact">
              <article className="metric">
                <span>总额</span>
                <strong>{formatCents(analytics?.totalCents || 0)}</strong>
                <p>家庭合计</p>
              </article>
              <article className="metric">
                <span>笔数</span>
                <strong>{analytics?.expenseCount || 0}</strong>
                <p>已同步记录</p>
              </article>
            </div>
            <AnalysisBreakdown
              analytics={analytics}
              categoryByID={categoryByID}
              memberByID={memberByID}
            />
          </section>
        )}

        {view === 'settings' && (
          <section className="panel">
            <div className="panel-header">
              <h2>设置</h2>
              <span>{session?.member.nickname || '未登录'}</span>
            </div>
            <form className="form-grid" onSubmit={connect}>
              {appRuntime && (
                <>
                  <label>
                    <span>服务地址</span>
                    <input value={serviceUrlDraft} onChange={(event) => setServiceUrlDraft(event.target.value)} />
                  </label>
                  <button type="submit" disabled={loading}>保存并测试</button>
                </>
              )}
              <button type="button" className="secondary" onClick={logout}>退出设备</button>
            </form>
          </section>
        )}
      </section>
    </main>
  )
}

function ExpenseFormPanel({
  categories,
  editingID,
  form,
  loading,
  onCancel,
  onChange,
  onSubmit,
}: {
  categories: Category[]
  editingID: number | null
  form: ExpenseForm
  loading: boolean
  onCancel: () => void
  onChange: (form: ExpenseForm) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{editingID ? '编辑支出' : '记录支出'}</h2>
        <span>{categories.length} 个分类</span>
      </div>
      <form className="form-grid" onSubmit={onSubmit}>
        <label>
          <span>金额</span>
          <input
            inputMode="decimal"
            value={form.amount}
            onChange={(event) => onChange({ ...form, amount: event.target.value })}
            placeholder="0.00"
          />
        </label>
        <label>
          <span>分类</span>
          <select value={form.categoryId} onChange={(event) => onChange({ ...form, categoryId: event.target.value })}>
            <option value="">选择分类</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>时间</span>
          <input
            type="datetime-local"
            value={form.spentAt}
            onChange={(event) => onChange({ ...form, spentAt: event.target.value })}
          />
        </label>
        <label>
          <span>备注</span>
          <input value={form.note} onChange={(event) => onChange({ ...form, note: event.target.value })} />
        </label>
        <div className="button-row">
          <button type="submit" disabled={loading}>{editingID ? '保存' : '记录'}</button>
          {editingID && <button type="button" className="secondary" onClick={onCancel}>取消</button>}
        </div>
      </form>
    </section>
  )
}

function ExpenseList({
  categoryByID,
  categories,
  categoryFilter,
  expenses,
  memberByID,
  memberFilter,
  members,
  onCategoryFilter,
  onDelete,
  onEdit,
  onMemberFilter,
}: {
  categoryByID: Map<number, Category>
  categories: Category[]
  categoryFilter: string
  expenses: Expense[]
  memberByID: Map<number, Member>
  memberFilter: string
  members: Member[]
  onCategoryFilter: (value: string) => void
  onDelete: (expenseID: number) => void
  onEdit: (expense: Expense) => void
  onMemberFilter: (value: string) => void
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>支出列表</h2>
        <span>{expenses.length} 笔</span>
      </div>
      <div className="filter-row">
        <label>
          <span>分类</span>
          <select value={categoryFilter} onChange={(event) => onCategoryFilter(event.target.value)}>
            <option value="">全部分类</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>成员</span>
          <select value={memberFilter} onChange={(event) => onMemberFilter(event.target.value)}>
            <option value="">全部成员</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>{member.nickname}</option>
            ))}
          </select>
        </label>
      </div>
      {expenses.length === 0 ? (
        <p className="empty-state">当前月份还没有支出记录</p>
      ) : (
        <div className="expense-list">
          {expenses.map((expense) => (
            <article className="expense-row" key={expense.id}>
              <div>
                <strong>{expense.note || categoryByID.get(expense.categoryId)?.name || '未命名支出'}</strong>
                <span>
                  {categoryByID.get(expense.categoryId)?.name || '分类'} · {memberByID.get(expense.memberId)?.nickname || '成员'} ·{' '}
                  {new Date(expense.spentAt).toLocaleDateString()}
                </span>
              </div>
              <b>{formatCents(expense.amountCents, expense.currency)}</b>
              <div className="row-actions">
                <button type="button" className="secondary" onClick={() => onEdit(expense)}>编辑</button>
                <button type="button" className="danger" onClick={() => onDelete(expense.id)}>删除</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function AnalysisBreakdown({
  analytics,
  categoryByID,
  memberByID,
}: {
  analytics: AnalyticsSummary | null
  categoryByID: Map<number, Category>
  memberByID: Map<number, Member>
}) {
  return (
    <div className="analysis-grid">
      <BreakdownList title="分类分布" items={analytics?.byCategory || []} />
      <BreakdownList title="成员分布" items={analytics?.byMember || []} />
      <section className="breakdown-card">
        <h3>最近支出</h3>
        {(analytics?.recentExpenses || []).length === 0 ? (
          <p className="empty-state">暂无最近支出</p>
        ) : (
          <div className="expense-list">
            {(analytics?.recentExpenses || []).map((expense) => (
              <article className="expense-row compact-row" key={expense.id}>
                <div>
                  <strong>{expense.note || categoryByID.get(expense.categoryId)?.name || '未命名支出'}</strong>
                  <span>
                    {memberByID.get(expense.memberId)?.nickname || '成员'} ·{' '}
                    {new Date(expense.spentAt).toLocaleDateString()}
                  </span>
                </div>
                <b>{formatCents(expense.amountCents, expense.currency)}</b>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

function BreakdownList({
  title,
  items,
}: {
  title: string
  items: AnalyticsSummary['byCategory']
}) {
  return (
    <section className="breakdown-card">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p className="empty-state">暂无数据</p>
      ) : (
        <div className="expense-list">
          {items.map((item) => (
            <article className="expense-row compact-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.expenseCount} 笔</span>
              </div>
              <b>{formatCents(item.totalCents)}</b>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function buildExpenseInput(form: ExpenseForm): ExpenseInput | null {
  const amount = Number(form.amount)
  const categoryId = Number(form.categoryId)
  if (!Number.isFinite(amount) || amount <= 0 || !categoryId || !form.spentAt) {
    return null
  }
  return {
    amountCents: Math.round(amount * 100),
    categoryId,
    currency: form.currency,
    note: form.note.trim(),
    spentAt: fromLocalDateTimeInput(form.spentAt),
  }
}

function viewLabel(view: View) {
  const labels: Record<View, string> = {
    overview: '概览',
    expenses: '支出',
    analysis: '分析',
    settings: '设置',
  }
  return labels[view]
}
