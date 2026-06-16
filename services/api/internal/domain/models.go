package domain

import "time"

type Member struct {
	ID          int64     `json:"id"`
	HouseholdID int64     `json:"householdId"`
	Name        string    `json:"name"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Expense struct {
	ID          int64     `json:"id"`
	HouseholdID int64     `json:"householdId"`
	MemberID    int64     `json:"memberId"`
	CategoryID  int64     `json:"categoryId"`
	AmountCents int64     `json:"amountCents"`
	Currency    string    `json:"currency"`
	Note        string    `json:"note"`
	SpentAt     time.Time `json:"spentAt"`
	CreatedAt   time.Time `json:"createdAt"`
}

type CreateExpenseInput struct {
	MemberID    int64     `json:"memberId" binding:"required"`
	CategoryID  int64     `json:"categoryId" binding:"required"`
	AmountCents int64     `json:"amountCents" binding:"required,min=1"`
	Currency    string    `json:"currency"`
	Note        string    `json:"note"`
	SpentAt     time.Time `json:"spentAt" binding:"required"`
}
