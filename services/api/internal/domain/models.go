package domain

import "time"

type Household struct {
	ID        int64     `json:"id"`
	Name      string    `json:"name"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type Member struct {
	ID               int64      `json:"id"`
	HouseholdID      int64      `json:"householdId"`
	Nickname         string     `json:"nickname"`
	SessionTokenHash string     `json:"-"`
	Status           string     `json:"status"`
	LastActiveAt     *time.Time `json:"lastActiveAt,omitempty"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`
}

type InviteCode struct {
	ID          int64      `json:"id"`
	HouseholdID int64      `json:"householdId"`
	CodeHash    string     `json:"-"`
	CreatedByID *int64     `json:"createdById,omitempty"`
	Status      string     `json:"status"`
	ExpiresAt   time.Time  `json:"expiresAt"`
	UsedByID    *int64     `json:"usedById,omitempty"`
	UsedAt      *time.Time `json:"usedAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

type InviteCodeWithPlaintext struct {
	InviteCode
	Code string `json:"code"`
}

type Category struct {
	ID          int64     `json:"id"`
	HouseholdID int64     `json:"householdId"`
	Name        string    `json:"name"`
	Kind        string    `json:"kind"`
	Color       string    `json:"color"`
	SortOrder   int       `json:"sortOrder"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type Expense struct {
	ID          int64      `json:"id"`
	HouseholdID int64      `json:"householdId"`
	MemberID    int64      `json:"memberId"`
	CategoryID  int64      `json:"categoryId"`
	AmountCents int64      `json:"amountCents"`
	Currency    string     `json:"currency"`
	Note        string     `json:"note"`
	SpentAt     time.Time  `json:"spentAt"`
	DeletedAt   *time.Time `json:"deletedAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

type AdminStatus struct {
	HasHousehold bool `json:"hasHousehold"`
	MemberCount  int  `json:"memberCount"`
}

type AnalyticsSummary struct {
	HouseholdID  int64 `json:"householdId"`
	TotalCents   int64 `json:"totalCents"`
	ExpenseCount int   `json:"expenseCount"`
}

type CreateExpenseInput struct {
	MemberID    int64     `json:"memberId" binding:"required"`
	CategoryID  int64     `json:"categoryId" binding:"required"`
	AmountCents int64     `json:"amountCents" binding:"required,min=1"`
	Currency    string    `json:"currency"`
	Note        string    `json:"note"`
	SpentAt     time.Time `json:"spentAt" binding:"required"`
}

type CreateHouseholdInput struct {
	Name string `json:"name" binding:"required"`
}

type CreateMemberInput struct {
	HouseholdID int64  `json:"householdId" binding:"required"`
	Nickname    string `json:"nickname" binding:"required"`
}

type CreateInviteCodeInput struct {
	HouseholdID int64     `json:"householdId" binding:"required"`
	CreatedByID *int64    `json:"createdById"`
	ExpiresAt   time.Time `json:"expiresAt" binding:"required"`
}

type CreateCategoryInput struct {
	HouseholdID int64  `json:"householdId" binding:"required"`
	Name        string `json:"name" binding:"required"`
	Kind        string `json:"kind"`
	Color       string `json:"color"`
	SortOrder   int    `json:"sortOrder"`
}
