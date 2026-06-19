export type Household = {
  id: number
  name: string
  status: string
  createdAt: string
  updatedAt: string
}

export type Member = {
  id: number
  householdId: number
  nickname: string
  status: string
  lastActiveAt?: string
  createdAt: string
  updatedAt?: string
}

export type Category = {
  id: number
  householdId: number
  name: string
  kind: string
  color: string
  sortOrder: number
  status: string
  createdAt: string
  updatedAt: string
}

export type Expense = {
  id: number
  householdId: number
  memberId: number
  categoryId: number
  amountCents: number
  currency: string
  note: string
  spentAt: string
  deletedAt?: string
  createdAt: string
  updatedAt: string
}

export type AnalyticsSummary = {
  householdId: number
  totalCents: number
  expenseCount: number
  byCategory: AnalyticsBreakdown[]
  byMember: AnalyticsBreakdown[]
  recentExpenses: Expense[]
}

export type AnalyticsBreakdown = {
  id: number
  name: string
  totalCents: number
  expenseCount: number
}

export type MemberSession = {
  household: Household
  member: Member
}

export type AdminStatus = {
  serviceStatus: string
  dbPath: string
  householdCount: number
  memberCount: number
  expenseCount: number
}

export type JoinResult = {
  household: Household
  member: Member
  token: string
}

export type AdminLoginResult = {
  token: string
}

export type InviteCode = {
  id: number
  householdId: number
  status: string
  expiresAt?: string
  usageCount: number
  createdAt: string
  code?: string
}

export type ApiEnvelope<T> = {
  data: T
}

export type ExpenseInput = {
  categoryId: number
  amountCents: number
  currency: string
  note: string
  spentAt: string
}

export type DeleteExpenseResult = {
  id: number
  deleted: boolean
}

export type MemberUpdateInput = {
  nickname: string
  status: string
}

export type CategoryInput = {
  name: string
  kind: string
  color: string
  sortOrder: number
  status?: string
}

export type ExpenseFilter = {
  month?: string
  categoryId?: number
  memberId?: number
}
