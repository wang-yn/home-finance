import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  adminLogin,
  createAdminCategory,
  createHousehold,
  createInviteCode,
  disableInviteCode,
  exportExpensesCsvUrl,
  getAdminStatus,
  listAdminCategories,
  listHouseholds,
  listMembers,
  updateAdminCategory,
  updateHousehold,
  updateMember,
} from '../api/client'
import type { AdminStatus, Category, CategoryInput, Household, InviteCode, Member } from '../api/types'
import { clearAdminToken, loadAdminToken, loadServiceUrl, saveAdminToken } from '../storage/session'
import { formatMonth } from '../utils/format'

type AdminView = 'login' | 'status' | 'households' | 'invites' | 'members' | 'categories' | 'export'

const emptyCategoryForm: CategoryInput = {
  name: '',
  kind: 'expense',
  color: '#64748b',
  sortOrder: 90,
}

export function AdminApp() {
  const [serviceUrl] = useState(loadServiceUrl)
  const [adminToken, setAdminToken] = useState(loadAdminToken)
  const [view, setView] = useState<AdminView>(adminToken ? 'status' : 'login')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<AdminStatus | null>(null)
  const [households, setHouseholds] = useState<Household[]>([])
  const [selectedHouseholdID, setSelectedHouseholdID] = useState<number | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([])
  const [householdName, setHouseholdName] = useState('')
  const [inviteDays, setInviteDays] = useState('7')
  const [categoryForm, setCategoryForm] = useState<CategoryInput>(emptyCategoryForm)
  const [month, setMonth] = useState(formatMonth(new Date()))
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedHousehold = useMemo(
    () => households.find((household) => household.id === selectedHouseholdID) || null,
    [households, selectedHouseholdID],
  )

  const handleError = useCallback((nextError: unknown) => {
    setError(nextError instanceof Error ? nextError.message : '请求失败')
  }, [])

  const refreshAdmin = useCallback(async (token = adminToken, householdID = selectedHouseholdID) => {
    if (!token) {
      return
    }
    setLoading(true)
    setError('')
    try {
      const [nextStatus, nextHouseholds] = await Promise.all([
        getAdminStatus(serviceUrl, token),
        listHouseholds(serviceUrl, token),
      ])
      const nextSelectedID = householdID || nextHouseholds[0]?.id || null
      const [nextMembers, nextCategories] = nextSelectedID
        ? await Promise.all([
            listMembers(serviceUrl, token, nextSelectedID),
            listAdminCategories(serviceUrl, token, nextSelectedID),
          ])
        : [[], []]
      setStatus(nextStatus)
      setHouseholds(nextHouseholds)
      setSelectedHouseholdID(nextSelectedID)
      setMembers(nextMembers)
      setCategories(nextCategories)
    } catch (nextError) {
      handleError(nextError)
    } finally {
      setLoading(false)
    }
  }, [adminToken, handleError, selectedHouseholdID, serviceUrl])

  useEffect(() => {
    if (!adminToken) {
      return
    }
    void Promise.resolve().then(() => refreshAdmin(adminToken))
  }, [adminToken, refreshAdmin])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await adminLogin(serviceUrl, password)
      saveAdminToken(result.token)
      setAdminToken(result.token)
      setView('status')
      setMessage('后台已登录')
      await refreshAdmin(result.token)
    } catch (nextError) {
      handleError(nextError)
    } finally {
      setLoading(false)
    }
  }

  function logout() {
    clearAdminToken()
    setAdminToken(null)
    setView('login')
    setStatus(null)
    setHouseholds([])
    setMembers([])
    setCategories([])
  }

  async function submitHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!adminToken || !householdName.trim()) {
      return
    }
    setLoading(true)
    setError('')
    try {
      await createHousehold(serviceUrl, adminToken, householdName.trim())
      setHouseholdName('')
      setMessage('家庭已创建')
      await refreshAdmin(adminToken)
    } catch (nextError) {
      handleError(nextError)
    } finally {
      setLoading(false)
    }
  }

  async function renameHousehold(household: Household) {
    if (!adminToken) {
      return
    }
    const name = window.prompt('家庭名称', household.name)
    if (!name?.trim()) {
      return
    }
    setLoading(true)
    setError('')
    try {
      await updateHousehold(serviceUrl, adminToken, household.id, name.trim())
      setMessage('家庭已更新')
      await refreshAdmin(adminToken, household.id)
    } catch (nextError) {
      handleError(nextError)
    } finally {
      setLoading(false)
    }
  }

  async function createInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!adminToken || !selectedHouseholdID) {
      return
    }
    setLoading(true)
    setError('')
    try {
      const invite = await createInviteCode(serviceUrl, adminToken, selectedHouseholdID, Number(inviteDays) || 7)
      setInviteCodes((current) => [invite, ...current])
      setMessage('邀请码已创建')
    } catch (nextError) {
      handleError(nextError)
    } finally {
      setLoading(false)
    }
  }

  async function disableInvite(inviteID: number) {
    if (!adminToken) {
      return
    }
    setLoading(true)
    setError('')
    try {
      await disableInviteCode(serviceUrl, adminToken, inviteID)
      setInviteCodes((current) =>
        current.map((invite) => (invite.id === inviteID ? { ...invite, status: 'disabled' } : invite)),
      )
      setMessage('邀请码已停用')
    } catch (nextError) {
      handleError(nextError)
    } finally {
      setLoading(false)
    }
  }

  async function toggleMember(member: Member) {
    if (!adminToken) {
      return
    }
    const nextStatus = member.status === 'active' ? 'disabled' : 'active'
    setLoading(true)
    setError('')
    try {
      await updateMember(serviceUrl, adminToken, member.id, { nickname: member.nickname, status: nextStatus })
      setMessage('成员状态已更新')
      await refreshAdmin(adminToken, member.householdId)
    } catch (nextError) {
      handleError(nextError)
    } finally {
      setLoading(false)
    }
  }

  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!adminToken || !selectedHouseholdID || !categoryForm.name.trim()) {
      return
    }
    setLoading(true)
    setError('')
    try {
      await createAdminCategory(serviceUrl, adminToken, selectedHouseholdID, categoryForm)
      setCategoryForm(emptyCategoryForm)
      setMessage('分类已创建')
      await refreshAdmin(adminToken, selectedHouseholdID)
    } catch (nextError) {
      handleError(nextError)
    } finally {
      setLoading(false)
    }
  }

  async function disableCategory(category: Category) {
    if (!adminToken) {
      return
    }
    setLoading(true)
    setError('')
    try {
      await updateAdminCategory(serviceUrl, adminToken, category.id, {
        name: category.name,
        kind: category.kind,
        color: category.color,
        sortOrder: category.sortOrder,
      })
      setMessage('分类已更新')
      await refreshAdmin(adminToken, category.householdId)
    } catch (nextError) {
      handleError(nextError)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="app-shell">
      <section className="workspace admin-layout">
        <aside className="admin-sidebar">
          <div>
            <p className="eyebrow">Admin</p>
            <h1>管理后台</h1>
          </div>
          <nav className="mobile-nav admin-nav" aria-label="后台导航">
            {(['login', 'status', 'households', 'invites', 'members', 'categories', 'export'] as AdminView[]).map((item) => (
              <button
                type="button"
                key={item}
                className={view === item ? 'active' : ''}
                onClick={() => setView(item)}
              >
                {adminViewLabel(item)}
              </button>
            ))}
          </nav>
          {adminToken && <button type="button" className="secondary" onClick={logout}>退出后台</button>}
        </aside>

        <section className="admin-main">
          {error && <p className="error">{error}</p>}
          {message && !error && <p className="status">{message}</p>}

          {view === 'login' && (
            <section className="panel">
              <div className="panel-header">
                <h2>后台登录</h2>
                <span>{serviceUrl}</span>
              </div>
              <form className="form-grid" onSubmit={login}>
                <label>
                  <span>管理密码</span>
                  <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
                </label>
                <button type="submit" disabled={loading}>登录</button>
              </form>
            </section>
          )}

          {view === 'status' && (
            <section className="metric-grid">
              <Metric label="服务" value={status?.serviceStatus || '-'} detail={status?.dbPath || serviceUrl} />
              <Metric label="家庭" value={String(status?.householdCount || 0)} detail="households" />
              <Metric label="成员" value={String(status?.memberCount || 0)} detail="members" />
              <Metric label="支出" value={String(status?.expenseCount || 0)} detail="expenses" />
            </section>
          )}

          {view === 'households' && (
            <section className="panel">
              <div className="panel-header">
                <h2>家庭</h2>
                <span>{households.length} 个</span>
              </div>
              <form className="form-grid inline-form" onSubmit={submitHousehold}>
                <label>
                  <span>家庭名称</span>
                  <input value={householdName} onChange={(event) => setHouseholdName(event.target.value)} />
                </label>
                <button type="submit" disabled={loading}>创建</button>
              </form>
              <ListEmpty show={households.length === 0} text="还没有家庭" />
              <div className="expense-list">
                {households.map((household) => (
                  <article className="expense-row" key={household.id}>
                    <div>
                      <strong>{household.name}</strong>
                      <span>{household.status}</span>
                    </div>
                    <button type="button" className="secondary" onClick={() => setSelectedHouseholdID(household.id)}>
                      选择
                    </button>
                    <button type="button" className="secondary" onClick={() => renameHousehold(household)}>重命名</button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {view === 'invites' && (
            <section className="panel">
              <PanelTitle selectedHousehold={selectedHousehold} title="邀请码" />
              <form className="form-grid inline-form" onSubmit={createInvite}>
                <label>
                  <span>有效天数</span>
                  <input value={inviteDays} onChange={(event) => setInviteDays(event.target.value)} />
                </label>
                <button type="submit" disabled={loading || !selectedHouseholdID}>生成</button>
              </form>
              <ListEmpty show={inviteCodes.length === 0} text="本页面只显示本次生成的邀请码" />
              <div className="expense-list">
                {inviteCodes.map((invite) => (
                  <article className="expense-row" key={invite.id}>
                    <div>
                      <strong>{invite.code || `#${invite.id}`}</strong>
                      <span>{invite.status} · 使用 {invite.usageCount} 次</span>
                    </div>
                    <button type="button" className="secondary" onClick={() => disableInvite(invite.id)}>停用</button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {view === 'members' && (
            <section className="panel">
              <PanelTitle selectedHousehold={selectedHousehold} title="成员" />
              <ListEmpty show={members.length === 0} text="当前家庭还没有成员" />
              <div className="expense-list">
                {members.map((member) => (
                  <article className="expense-row" key={member.id}>
                    <div>
                      <strong>{member.nickname}</strong>
                      <span>{member.status}</span>
                    </div>
                    <button type="button" className="secondary" onClick={() => toggleMember(member)}>
                      {member.status === 'active' ? '停用' : '启用'}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {view === 'categories' && (
            <section className="panel">
              <PanelTitle selectedHousehold={selectedHousehold} title="分类" />
              <form className="form-grid inline-form" onSubmit={submitCategory}>
                <label>
                  <span>名称</span>
                  <input
                    value={categoryForm.name}
                    onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })}
                  />
                </label>
                <label>
                  <span>颜色</span>
                  <input
                    value={categoryForm.color}
                    onChange={(event) => setCategoryForm({ ...categoryForm, color: event.target.value })}
                  />
                </label>
                <button type="submit" disabled={loading || !selectedHouseholdID}>创建</button>
              </form>
              <div className="expense-list">
                {categories.map((category) => (
                  <article className="expense-row" key={category.id}>
                    <div>
                      <strong>{category.name}</strong>
                      <span>{category.status} · {category.color}</span>
                    </div>
                    <button type="button" className="secondary" onClick={() => disableCategory(category)}>同步</button>
                  </article>
                ))}
              </div>
            </section>
          )}

          {view === 'export' && (
            <section className="panel">
              <PanelTitle selectedHousehold={selectedHousehold} title="导出" />
              <form className="form-grid">
                <label>
                  <span>月份</span>
                  <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                </label>
                {selectedHouseholdID ? (
                  <a className="download-link" href={exportExpensesCsvUrl(serviceUrl, selectedHouseholdID, month)}>
                    下载 CSV
                  </a>
                ) : (
                  <p className="empty-state">请先选择家庭</p>
                )}
              </form>
            </section>
          )}
        </section>
      </section>
    </main>
  )
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  )
}

function PanelTitle({ selectedHousehold, title }: { selectedHousehold: Household | null; title: string }) {
  return (
    <div className="panel-header">
      <h2>{title}</h2>
      <span>{selectedHousehold?.name || '未选择家庭'}</span>
    </div>
  )
}

function ListEmpty({ show, text }: { show: boolean; text: string }) {
  return show ? <p className="empty-state">{text}</p> : null
}

function adminViewLabel(view: AdminView) {
  const labels: Record<AdminView, string> = {
    login: '登录',
    status: '状态',
    households: '家庭',
    invites: '邀请码',
    members: '成员',
    categories: '分类',
    export: '导出',
  }
  return labels[view]
}
