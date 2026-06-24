import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ApiError,
  adminLogin,
  createAdminCategory,
  createHousehold,
  createInviteCode,
  disableInviteCode,
  exportExpensesCsv,
  getAdminStatus,
  listInviteCodes,
  listAdminCategories,
  listHouseholds,
  listMembers,
  updateHousehold,
  updateAdminCategory,
  updateMember,
} from '../api/client'
import type { AdminStatus, Category, CategoryInput, Household, InviteCode, Member } from '../api/types'
import { clearAdminToken, loadAdminToken, loadServiceUrl, saveAdminToken } from '../storage/session'
import { formatMonth } from '../utils/format'

type AdminView = 'status' | 'households' | 'invites' | 'members' | 'categories' | 'export'

const emptyCategoryForm: CategoryInput = {
  name: '',
  kind: 'expense',
  color: '#64748b',
  sortOrder: 90,
  status: 'active',
}

export function AdminApp() {
  const [serviceUrl] = useState(loadServiceUrl)
  const [adminToken, setAdminToken] = useState(loadAdminToken)
  const [validatedAdminToken, setValidatedAdminToken] = useState<string | null>(null)
  const [hydratedAdminToken, setHydratedAdminToken] = useState<string | null>(null)
  const [view, setView] = useState<AdminView>('status')
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

  const logout = useCallback(() => {
    clearAdminToken()
    setAdminToken(null)
    setValidatedAdminToken(null)
    setHydratedAdminToken(null)
    setView('status')
    setStatus(null)
    setHouseholds([])
    setSelectedHouseholdID(null)
    setMembers([])
    setCategories([])
    setInviteCodes([])
    setHouseholdName('')
    setInviteDays('7')
    setCategoryForm(emptyCategoryForm)
    setMessage('')
    setError('')
  }, [])

  const handleAuthenticatedError = useCallback((nextError: unknown, requestToken: string) => {
    handleError(nextError)
    if (nextError instanceof ApiError && nextError.status === 401 && loadAdminToken() === requestToken) {
      logout()
    }
  }, [handleError, logout])

  const validateAdminToken = useCallback(async (token = adminToken) => {
    if (!token) {
      return
    }
    const isCurrentToken = () => loadAdminToken() === token
    setError('')
    try {
      const nextStatus = await getAdminStatus(serviceUrl, token)
      if (!isCurrentToken()) {
        return
      }
      setStatus(nextStatus)
      setValidatedAdminToken(token)
    } catch (nextError) {
      if (!isCurrentToken()) {
        return
      }
      handleAuthenticatedError(nextError, token)
    }
  }, [adminToken, handleAuthenticatedError, serviceUrl])

  const refreshAdminData = useCallback(async (token = adminToken, householdID = selectedHouseholdID) => {
    if (!token) {
      return
    }
    const isCurrentToken = () => loadAdminToken() === token
    setLoading(true)
    setError('')
    try {
      const [nextStatus, nextHouseholds] = await Promise.all([
        getAdminStatus(serviceUrl, token),
        listHouseholds(serviceUrl, token),
      ])
      const nextSelectedID = householdID || nextHouseholds[0]?.id || null
      const [nextMembers, nextCategories, nextInviteCodes] = nextSelectedID
        ? await Promise.all([
            listMembers(serviceUrl, token, nextSelectedID),
            listAdminCategories(serviceUrl, token, nextSelectedID),
            listInviteCodes(serviceUrl, token, nextSelectedID),
          ])
        : [[], [], []]
      if (!isCurrentToken()) {
        return
      }
      setStatus(nextStatus)
      setHouseholds(nextHouseholds)
      setSelectedHouseholdID(nextSelectedID)
      setMembers(nextMembers)
      setCategories(nextCategories)
      setInviteCodes(nextInviteCodes)
      setHydratedAdminToken(token)
    } catch (nextError) {
      if (!isCurrentToken()) {
        return
      }
      handleAuthenticatedError(nextError, token)
    } finally {
      setLoading(false)
    }
  }, [adminToken, handleAuthenticatedError, selectedHouseholdID, serviceUrl])

  const loadHouseholdScope = useCallback(async (token: string, householdID: number) => {
    const isCurrentToken = () => loadAdminToken() === token
    setMembers([])
    setCategories([])
    setInviteCodes([])
    setSelectedHouseholdID(householdID)
    const [nextMembers, nextCategories, nextInviteCodes] = await Promise.all([
      listMembers(serviceUrl, token, householdID),
      listAdminCategories(serviceUrl, token, householdID),
      listInviteCodes(serviceUrl, token, householdID),
    ])
    if (!isCurrentToken()) {
      return
    }
    setMembers(nextMembers)
    setCategories(nextCategories)
    setInviteCodes(nextInviteCodes)
  }, [serviceUrl])

  useEffect(() => {
    if (!adminToken || validatedAdminToken === adminToken) {
      return
    }
    void Promise.resolve().then(() => validateAdminToken(adminToken))
  }, [adminToken, validateAdminToken, validatedAdminToken])

  useEffect(() => {
    if (!adminToken || validatedAdminToken !== adminToken || hydratedAdminToken === adminToken) {
      return
    }
    void Promise.resolve().then(() => refreshAdminData(adminToken))
  }, [adminToken, hydratedAdminToken, refreshAdminData, validatedAdminToken])

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await adminLogin(serviceUrl, password)
      saveAdminToken(result.token)
      setAdminToken(result.token)
      const nextStatus = await getAdminStatus(serviceUrl, result.token)
      setStatus(nextStatus)
      setValidatedAdminToken(result.token)
      setView('status')
      setMessage('后台已登录')
    } catch (nextError) {
      handleError(nextError)
    } finally {
      setLoading(false)
    }
  }

  if (!adminToken || validatedAdminToken !== adminToken) {
    return (
      <main className="app-shell public-shell">
        <section className="public-entry" aria-labelledby="admin-public-title">
          <p className="eyebrow">管理后台</p>
          <h1 id="admin-public-title">管理后台登录</h1>
          <p className="entry-copy">登录后管理家庭、成员、分类和导出。</p>

          {error && <p className="error" role="alert">{error}</p>}
          {message && !error && <p className="status" aria-live="polite">{message}</p>}

          <form className="form-grid" onSubmit={login}>
            <label>
              <span>管理密码</span>
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </label>
            <button type="submit" disabled={loading}>登录</button>
          </form>
        </section>
      </main>
    )
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
      await refreshAdminData(adminToken)
    } catch (nextError) {
      handleAuthenticatedError(nextError, adminToken)
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
      await refreshAdminData(adminToken, household.id)
    } catch (nextError) {
      handleAuthenticatedError(nextError, adminToken)
    } finally {
      setLoading(false)
    }
  }

  async function selectHousehold(householdID: number) {
    if (!adminToken) {
      return
    }
    setLoading(true)
    setError('')
    try {
      await loadHouseholdScope(adminToken, householdID)
      setMessage('家庭已选择')
    } catch (nextError) {
      handleAuthenticatedError(nextError, adminToken)
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
      await createInviteCode(serviceUrl, adminToken, selectedHouseholdID, Number(inviteDays) || 7)
      setMessage('邀请码已创建')
      await loadHouseholdScope(adminToken, selectedHouseholdID)
    } catch (nextError) {
      handleAuthenticatedError(nextError, adminToken)
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
      setMessage('邀请码已停用')
      if (selectedHouseholdID) {
        await loadHouseholdScope(adminToken, selectedHouseholdID)
      }
    } catch (nextError) {
      handleAuthenticatedError(nextError, adminToken)
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
      await refreshAdminData(adminToken, member.householdId)
    } catch (nextError) {
      handleAuthenticatedError(nextError, adminToken)
    } finally {
      setLoading(false)
    }
  }

  async function renameMember(member: Member) {
    if (!adminToken) {
      return
    }
    const nickname = window.prompt('成员昵称', member.nickname)
    if (!nickname?.trim()) {
      return
    }
    setLoading(true)
    setError('')
    try {
      await updateMember(serviceUrl, adminToken, member.id, { nickname: nickname.trim(), status: member.status })
      setMessage('成员已重命名')
      await refreshAdminData(adminToken, member.householdId)
    } catch (nextError) {
      handleAuthenticatedError(nextError, adminToken)
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
      await refreshAdminData(adminToken, selectedHouseholdID)
    } catch (nextError) {
      handleAuthenticatedError(nextError, adminToken)
    } finally {
      setLoading(false)
    }
  }

  async function editCategory(category: Category) {
    if (!adminToken) {
      return
    }
    const name = window.prompt('分类名称', category.name)
    if (!name?.trim()) {
      return
    }
    const color = window.prompt('分类颜色', category.color)
    if (!color?.trim()) {
      return
    }
    setLoading(true)
    setError('')
    try {
      await updateAdminCategory(serviceUrl, adminToken, category.id, {
        name: name.trim(),
        kind: category.kind,
        color: color.trim(),
        sortOrder: category.sortOrder,
        status: category.status,
      })
      setMessage('分类已更新')
      await refreshAdminData(adminToken, category.householdId)
    } catch (nextError) {
      handleAuthenticatedError(nextError, adminToken)
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
        status: 'disabled',
      })
      setMessage('分类已停用')
      await refreshAdminData(adminToken, category.householdId)
    } catch (nextError) {
      handleAuthenticatedError(nextError, adminToken)
    } finally {
      setLoading(false)
    }
  }

  async function downloadCsv() {
    if (!adminToken || !selectedHouseholdID) {
      return
    }
    setLoading(true)
    setError('')
    try {
      const csv = await exportExpensesCsv(serviceUrl, adminToken, selectedHouseholdID, month)
      const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = blobUrl
      link.download = `expenses-${selectedHouseholdID}-${month || 'all'}.csv`
      link.click()
      URL.revokeObjectURL(blobUrl)
      setMessage('CSV 已下载')
    } catch (nextError) {
      handleAuthenticatedError(nextError, adminToken)
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
            {(['status', 'households', 'invites', 'members', 'categories', 'export'] as AdminView[]).map((item) => (
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
          {error && <p className="error" role="alert">{error}</p>}
          {message && !error && <p className="status" aria-live="polite">{message}</p>}

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
                    <button type="button" className="secondary" onClick={() => selectHousehold(household.id)}>
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
              <ListEmpty show={inviteCodes.length === 0} text="当前家庭还没有邀请码" />
              <div className="expense-list">
                {inviteCodes.map((invite) => (
                  <article className="expense-row" key={invite.id}>
                    <div>
                      <strong>{invite.code || `#${invite.id}`}</strong>
                      <span>{invite.status} · 使用 {invite.usageCount} 次</span>
                    </div>
                    {invite.status === 'active' && (
                      <button type="button" className="secondary" onClick={() => disableInvite(invite.id)}>停用</button>
                    )}
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
                    <div className="row-actions">
                      <button type="button" className="secondary" onClick={() => renameMember(member)}>重命名</button>
                      <button type="button" className="secondary" onClick={() => toggleMember(member)}>
                        {member.status === 'active' ? '停用' : '启用'}
                      </button>
                    </div>
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
                    <div className="row-actions">
                      <button type="button" className="secondary" onClick={() => editCategory(category)}>编辑</button>
                      {category.status === 'active' && (
                        <button type="button" className="secondary" onClick={() => disableCategory(category)}>停用</button>
                      )}
                    </div>
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
                  <button type="button" className="download-link" onClick={downloadCsv} disabled={loading}>
                    下载 CSV
                  </button>
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
    status: '状态',
    households: '家庭',
    invites: '邀请码',
    members: '成员',
    categories: '分类',
    export: '导出',
  }
  return labels[view]
}
