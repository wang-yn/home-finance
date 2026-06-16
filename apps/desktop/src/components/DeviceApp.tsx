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
  updateExpense,
} from '../api/client'
import type { AnalyticsSummary, Category, Expense, ExpenseInput, MemberSession } from '../api/types'
import {
  clearMemberToken,
  loadMemberToken,
  loadServiceUrl,
  saveMemberToken,
  saveServiceUrl,
} from '../storage/session'
import { formatCents, formatMonth, fromLocalDateTimeInput, toLocalDateTimeInput } from '../utils/format'

type View = 'connect' | 'join' | 'overview' | 'expenses' | 'analysis' | 'settings'

const initialExpenseForm = {
  categoryId: '',
  amount: '',
  currency: 'CNY',
  note: '',
  spentAt: toLocalDateTimeInput(new Date()),
}

type ExpenseForm = typeof initialExpenseForm

export function DeviceApp() {
  const [activeServiceUrl, setActiveServiceUrl] = useState(loadServiceUrl)
  const [serviceUrlDraft, setServiceUrlDraft] = useState(activeServiceUrl)
  const [token, setToken] = useState(loadMemberToken)
  const [view, setView] = useState<View>(token ? 'overview' : 'connect')
  const [session, setSession] = useState<MemberSession | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [analytics, setAnalytics] = useState<AnalyticsSummary | null>(null)
  const [month, setMonth] = useState(formatMonth(new Date()))
  const [inviteCode, setInviteCode] = useState('')
  const [nickname, setNickname] = useState('')
  const [expenseForm, setExpenseForm] = useState<ExpenseForm>(initialExpenseForm)
  const [editingID, setEditingID] = useState<number | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const categoryByID = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories])

  const logout = useCallback(() => {
    clearMemberToken()
    setToken(null)
    setSession(null)
    setExpenses([])
    setAnalytics(null)
    setView('connect')
  }, [])

  const handleError = useCallback((nextError: unknown) => {
    setError(nextError instanceof Error ? nextError.message : '请求失败')
  }, [])

  const refreshData = useCallback(async (currentToken = token) => {
    if (!currentToken) {
      return
    }
    setLoading(true)
    setError('')
    try {
      const [nextSession, nextCategories, nextExpenses, nextAnalytics] = await Promise.all([
        getMe(activeServiceUrl, currentToken),
        getCategories(activeServiceUrl, currentToken),
        getExpenses(activeServiceUrl, currentToken, month),
        getMonthlyAnalytics(activeServiceUrl, currentToken, month),
      ])
      setSession(nextSession)
      setCategories(nextCategories)
      setExpenses(nextExpenses)
      setAnalytics(nextAnalytics)
    } catch (nextError) {
      handleError(nextError)
      if (nextError instanceof ApiError && nextError.status === 401) {
        logout()
      }
    } finally {
      setLoading(false)
    }
  }, [activeServiceUrl, handleError, logout, month, token])

  useEffect(() => {
    if (!token) {
      return
    }
    void Promise.resolve().then(() => refreshData(token))
  }, [refreshData, token])

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      await health(serviceUrlDraft)
      saveServiceUrl(serviceUrlDraft)
      setActiveServiceUrl(serviceUrlDraft)
      setStatus('服务已连接')
      setView(token ? 'overview' : 'join')
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
      setExpenseForm({ ...initialExpenseForm, categoryId: expenseForm.categoryId })
      setEditingID(null)
      await refreshData(token)
      setView('expenses')
    } catch (nextError) {
      handleError(nextError)
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
      handleError(nextError)
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
          {(['connect', 'join', 'overview', 'expenses', 'analysis', 'settings'] as View[]).map((item) => (
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

        {error && <p className="error">{error}</p>}
        {status && !error && <p className="status">{status}</p>}

        {view === 'connect' && (
          <section className="panel">
            <div className="panel-header">
              <h2>服务连接</h2>
              <span>{loading ? '连接中' : 'API 地址'}</span>
            </div>
            <form className="form-grid" onSubmit={connect}>
              <label>
                <span>服务地址</span>
                <input value={serviceUrlDraft} onChange={(event) => setServiceUrlDraft(event.target.value)} />
              </label>
              <button type="submit" disabled={loading}>连接</button>
            </form>
          </section>
        )}

        {view === 'join' && (
          <section className="panel">
            <div className="panel-header">
              <h2>加入家庭</h2>
              <span>邀请码</span>
            </div>
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
        )}

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
                setExpenseForm(initialExpenseForm)
              }}
              onChange={setExpenseForm}
              onSubmit={submitExpense}
            />
            <ExpenseList
              categoryByID={categoryByID}
              expenses={expenses}
              onDelete={removeExpense}
              onEdit={editExpense}
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
          </section>
        )}

        {view === 'settings' && (
          <section className="panel">
            <div className="panel-header">
              <h2>设置</h2>
              <span>{session?.member.nickname || '未登录'}</span>
            </div>
            <form className="form-grid" onSubmit={connect}>
              <label>
                <span>服务地址</span>
                <input value={serviceUrlDraft} onChange={(event) => setServiceUrlDraft(event.target.value)} />
              </label>
              <button type="submit" disabled={loading}>保存并测试</button>
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
  expenses,
  onDelete,
  onEdit,
}: {
  categoryByID: Map<number, Category>
  expenses: Expense[]
  onDelete: (expenseID: number) => void
  onEdit: (expense: Expense) => void
}) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>支出列表</h2>
        <span>{expenses.length} 笔</span>
      </div>
      {expenses.length === 0 ? (
        <p className="empty-state">当前月份还没有支出记录</p>
      ) : (
        <div className="expense-list">
          {expenses.map((expense) => (
            <article className="expense-row" key={expense.id}>
              <div>
                <strong>{expense.note || categoryByID.get(expense.categoryId)?.name || '未命名支出'}</strong>
                <span>{categoryByID.get(expense.categoryId)?.name || '分类'} · {new Date(expense.spentAt).toLocaleDateString()}</span>
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
    connect: '连接',
    join: '加入',
    overview: '概览',
    expenses: '支出',
    analysis: '分析',
    settings: '设置',
  }
  return labels[view]
}
