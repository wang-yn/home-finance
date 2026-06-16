package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"home-finance/services/api/internal/domain"
)

func (s *Store) JoinHousehold(ctx context.Context, inviteCode, nickname string) (domain.JoinResult, error) {
	nickname = strings.TrimSpace(nickname)
	if nickname == "" {
		return domain.JoinResult{}, errors.New("nickname is required")
	}

	token, err := GenerateToken()
	if err != nil {
		return domain.JoinResult{}, err
	}

	now := time.Now().UTC()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.JoinResult{}, err
	}
	defer tx.Rollback()

	var invite struct {
		ID          int64
		HouseholdID int64
	}
	if err := tx.QueryRowContext(ctx, `
		SELECT id, household_id
		FROM invite_codes
		WHERE code_hash = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?)
	`, HashSecret(inviteCode), now).Scan(&invite.ID, &invite.HouseholdID); err != nil {
		return domain.JoinResult{}, err
	}

	usageResult, err := tx.ExecContext(ctx, `
		UPDATE invite_codes
		SET usage_count = usage_count + 1
		WHERE id = ? AND status = 'active' AND (expires_at IS NULL OR expires_at > ?)
	`, invite.ID, now)
	if err != nil {
		return domain.JoinResult{}, err
	}
	if err := ensureChanged(usageResult); err != nil {
		return domain.JoinResult{}, err
	}

	result, err := tx.ExecContext(ctx, `
		INSERT INTO members (household_id, nickname, session_token_hash, status, last_active_at, created_at, updated_at)
		VALUES (?, ?, ?, 'active', ?, ?, ?)
	`, invite.HouseholdID, nickname, HashSecret(token), now, now, now)
	if err != nil {
		return domain.JoinResult{}, err
	}

	memberID, err := result.LastInsertId()
	if err != nil {
		return domain.JoinResult{}, err
	}

	household, err := scanHousehold(tx.QueryRowContext(ctx, `
		SELECT id, name, status, created_at, updated_at
		FROM households
		WHERE id = ? AND status = 'active'
	`, invite.HouseholdID))
	if err != nil {
		return domain.JoinResult{}, err
	}

	member, err := scanMember(tx.QueryRowContext(ctx, `
		SELECT id, household_id, nickname, session_token_hash, status, last_active_at, created_at, updated_at
		FROM members
		WHERE id = ?
	`, memberID))
	if err != nil {
		return domain.JoinResult{}, err
	}

	if err := tx.Commit(); err != nil {
		return domain.JoinResult{}, err
	}

	return domain.JoinResult{
		Household: household,
		Member:    member,
		Token:     token,
	}, nil
}

func (s *Store) MemberBySessionToken(ctx context.Context, token string) (domain.MemberSession, error) {
	if strings.TrimSpace(token) == "" {
		return domain.MemberSession{}, sql.ErrNoRows
	}

	now := time.Now().UTC()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.MemberSession{}, err
	}
	defer tx.Rollback()

	session, err := scanMemberSession(tx.QueryRowContext(ctx, `
		SELECT
			h.id, h.name, h.status, h.created_at, h.updated_at,
			m.id, m.household_id, m.nickname, m.session_token_hash, m.status, m.last_active_at, m.created_at, m.updated_at
		FROM members m
		INNER JOIN households h ON h.id = m.household_id
		WHERE m.session_token_hash = ? AND m.status = 'active' AND h.status = 'active'
	`, HashSecret(token)))
	if err != nil {
		return domain.MemberSession{}, err
	}

	if _, err := tx.ExecContext(ctx, `
		UPDATE members
		SET last_active_at = ?, updated_at = ?
		WHERE id = ? AND status = 'active'
	`, now, now, session.Member.ID); err != nil {
		return domain.MemberSession{}, err
	}

	session.Member.LastActiveAt = &now
	session.Member.UpdatedAt = now

	if err := tx.Commit(); err != nil {
		return domain.MemberSession{}, err
	}

	return session, nil
}

func (s *Store) ListActiveCategories(ctx context.Context, householdID int64) ([]domain.Category, error) {
	if _, err := s.householdByID(ctx, householdID); err != nil {
		return nil, err
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, household_id, name, kind, color, sort_order, status, created_at, updated_at
		FROM categories
		WHERE household_id = ? AND status = 'active'
		ORDER BY sort_order ASC, name ASC, id ASC
	`, householdID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	categories := []domain.Category{}
	for rows.Next() {
		category, err := scanCategory(rows)
		if err != nil {
			return nil, err
		}
		categories = append(categories, category)
	}

	return categories, rows.Err()
}

func (s *Store) CreateExpense(ctx context.Context, session domain.MemberSession, input domain.CreateExpenseInput) (domain.Expense, error) {
	return s.createExpenseWithMember(ctx, session, input)
}

func (s *Store) CreateExpenseForHousehold(ctx context.Context, householdID int64, input domain.CreateExpenseInput) (domain.Expense, error) {
	session := domain.MemberSession{
		Household: domain.Household{ID: householdID},
		Member:    domain.Member{ID: input.MemberID, HouseholdID: householdID},
	}
	return s.createExpenseWithMember(ctx, session, input)
}

func (s *Store) UpdateExpense(ctx context.Context, session domain.MemberSession, expenseID int64, input domain.UpdateExpenseInput) (domain.Expense, error) {
	if input.Currency == "" {
		input.Currency = "CNY"
	}
	if input.AmountCents <= 0 {
		return domain.Expense{}, errors.New("amount must be positive")
	}
	if err := s.requireActiveCategory(ctx, session.Household.ID, input.CategoryID); err != nil {
		return domain.Expense{}, err
	}

	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, `
		UPDATE expenses
		SET category_id = ?, amount_cents = ?, currency = ?, note = ?, spent_at = ?, updated_at = ?
		WHERE id = ? AND household_id = ? AND deleted_at IS NULL
	`, input.CategoryID, input.AmountCents, input.Currency, input.Note, input.SpentAt.UTC(), now, expenseID, session.Household.ID)
	if err != nil {
		return domain.Expense{}, err
	}
	if err := ensureChanged(result); err != nil {
		return domain.Expense{}, err
	}

	return s.expenseByID(ctx, session.Household.ID, expenseID)
}

func (s *Store) DeleteExpense(ctx context.Context, session domain.MemberSession, expenseID int64) error {
	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, `
		UPDATE expenses
		SET deleted_at = ?, updated_at = ?
		WHERE id = ? AND household_id = ? AND deleted_at IS NULL
	`, now, now, expenseID, session.Household.ID)
	if err != nil {
		return err
	}
	return ensureChanged(result)
}

func (s *Store) ListExpenses(ctx context.Context, session domain.MemberSession, filter domain.ExpenseFilter) ([]domain.Expense, error) {
	query := `
		SELECT id, household_id, member_id, category_id, amount_cents, currency, note, spent_at, deleted_at, created_at, updated_at
		FROM expenses
		WHERE household_id = ? AND deleted_at IS NULL
	`
	args := []any{session.Household.ID}
	if filter.Month != "" {
		start, end, err := monthBounds(filter.Month)
		if err != nil {
			return nil, err
		}
		query += " AND spent_at >= ? AND spent_at < ?"
		args = append(args, start, end)
	}
	query += " ORDER BY spent_at DESC, id DESC"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	expenses := []domain.Expense{}
	for rows.Next() {
		expense, err := scanExpense(rows)
		if err != nil {
			return nil, err
		}
		expenses = append(expenses, expense)
	}

	return expenses, rows.Err()
}

func (s *Store) ListExpensesForHousehold(ctx context.Context, householdID int64) ([]domain.Expense, error) {
	return s.ListExpenses(ctx, domain.MemberSession{Household: domain.Household{ID: householdID}}, domain.ExpenseFilter{})
}

func (s *Store) MonthlyAnalytics(ctx context.Context, session domain.MemberSession, month string) (domain.AnalyticsSummary, error) {
	start, end, err := monthBounds(month)
	if err != nil {
		return domain.AnalyticsSummary{}, err
	}

	summary := domain.AnalyticsSummary{HouseholdID: session.Household.ID}
	err = s.db.QueryRowContext(ctx, `
		SELECT COALESCE(SUM(amount_cents), 0), COUNT(*)
		FROM expenses
		WHERE household_id = ? AND deleted_at IS NULL AND spent_at >= ? AND spent_at < ?
	`, session.Household.ID, start, end).Scan(&summary.TotalCents, &summary.ExpenseCount)
	if err != nil {
		return domain.AnalyticsSummary{}, err
	}

	return summary, nil
}

func (s *Store) createExpenseWithMember(ctx context.Context, session domain.MemberSession, input domain.CreateExpenseInput) (domain.Expense, error) {
	if input.Currency == "" {
		input.Currency = "CNY"
	}
	if input.AmountCents <= 0 {
		return domain.Expense{}, errors.New("amount must be positive")
	}
	if err := s.requireActiveCategory(ctx, session.Household.ID, input.CategoryID); err != nil {
		return domain.Expense{}, err
	}

	now := time.Now().UTC()
	spentAt := input.SpentAt.UTC()
	result, err := s.db.ExecContext(ctx, `
		INSERT INTO expenses (household_id, member_id, category_id, amount_cents, currency, note, spent_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, session.Household.ID, session.Member.ID, input.CategoryID, input.AmountCents, input.Currency, input.Note, spentAt, now, now)
	if err != nil {
		return domain.Expense{}, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return domain.Expense{}, err
	}

	return s.expenseByID(ctx, session.Household.ID, id)
}

func (s *Store) requireActiveCategory(ctx context.Context, householdID, categoryID int64) error {
	var exists int
	return s.db.QueryRowContext(ctx, `
		SELECT 1
		FROM categories
		WHERE id = ? AND household_id = ? AND status = 'active'
	`, categoryID, householdID).Scan(&exists)
}

func (s *Store) expenseByID(ctx context.Context, householdID, expenseID int64) (domain.Expense, error) {
	return scanExpense(s.db.QueryRowContext(ctx, `
		SELECT id, household_id, member_id, category_id, amount_cents, currency, note, spent_at, deleted_at, created_at, updated_at
		FROM expenses
		WHERE id = ? AND household_id = ? AND deleted_at IS NULL
	`, expenseID, householdID))
}

func scanExpense(row scanner) (domain.Expense, error) {
	var expense domain.Expense
	err := row.Scan(
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
	)
	return expense, err
}

func monthBounds(month string) (time.Time, time.Time, error) {
	start, err := time.Parse("2006-01", strings.TrimSpace(month))
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("invalid month")
	}
	start = time.Date(start.Year(), start.Month(), 1, 0, 0, 0, 0, time.UTC)
	return start, start.AddDate(0, 1, 0), nil
}

func scanMemberSession(row scanner) (domain.MemberSession, error) {
	var session domain.MemberSession
	err := row.Scan(
		&session.Household.ID,
		&session.Household.Name,
		&session.Household.Status,
		&session.Household.CreatedAt,
		&session.Household.UpdatedAt,
		&session.Member.ID,
		&session.Member.HouseholdID,
		&session.Member.Nickname,
		&session.Member.SessionTokenHash,
		&session.Member.Status,
		&session.Member.LastActiveAt,
		&session.Member.CreatedAt,
		&session.Member.UpdatedAt,
	)
	return session, err
}
