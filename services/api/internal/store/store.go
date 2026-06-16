package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"home-finance/services/api/internal/domain"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}

	db.SetMaxOpenConns(1)

	store := &Store{db: db}
	if err := store.migrate(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}

	return store, nil
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) Health(ctx context.Context) error {
	return s.db.PingContext(ctx)
}

func (s *Store) ListMembers(ctx context.Context, householdID int64) ([]domain.Member, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, household_id, nickname, session_token_hash, status, last_active_at, created_at, updated_at
		FROM members
		WHERE household_id = ?
		ORDER BY nickname ASC
	`, householdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := []domain.Member{}
	for rows.Next() {
		var member domain.Member
		if err := rows.Scan(
			&member.ID,
			&member.HouseholdID,
			&member.Nickname,
			&member.SessionTokenHash,
			&member.Status,
			&member.LastActiveAt,
			&member.CreatedAt,
			&member.UpdatedAt,
		); err != nil {
			return nil, err
		}
		members = append(members, member)
	}

	return members, rows.Err()
}

func (s *Store) ListExpenses(ctx context.Context, householdID int64) ([]domain.Expense, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, household_id, member_id, category_id, amount_cents, currency, note, spent_at, deleted_at, created_at, updated_at
		FROM expenses
		WHERE household_id = ? AND deleted_at IS NULL
		ORDER BY spent_at DESC, id DESC
	`, householdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	expenses := []domain.Expense{}
	for rows.Next() {
		var expense domain.Expense
		if err := rows.Scan(
			&expense.ID,
			&expense.HouseholdID,
			&expense.MemberID,
			&expense.CategoryID,
			&expense.AmountCents,
			&expense.Currency,
			&expense.Note,
			&expense.SpentAt,
			&expense.DeletedAt,
			&expense.CreatedAt,
			&expense.UpdatedAt,
		); err != nil {
			return nil, err
		}
		expenses = append(expenses, expense)
	}

	return expenses, rows.Err()
}

func (s *Store) CreateExpense(ctx context.Context, householdID int64, input domain.CreateExpenseInput) (domain.Expense, error) {
	if input.Currency == "" {
		input.Currency = "CNY"
	}
	if input.AmountCents <= 0 {
		return domain.Expense{}, errors.New("amount must be positive")
	}

	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, `
		INSERT INTO expenses (household_id, member_id, category_id, amount_cents, currency, note, spent_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, householdID, input.MemberID, input.CategoryID, input.AmountCents, input.Currency, input.Note, input.SpentAt.UTC(), now, now)
	if err != nil {
		return domain.Expense{}, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return domain.Expense{}, err
	}

	return domain.Expense{
		ID:          id,
		HouseholdID: householdID,
		MemberID:    input.MemberID,
		CategoryID:  input.CategoryID,
		AmountCents: input.AmountCents,
		Currency:    input.Currency,
		Note:        input.Note,
		SpentAt:     input.SpentAt.UTC(),
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func (s *Store) migrate(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, schema)
	return err
}
