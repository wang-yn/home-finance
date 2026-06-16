package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"home-finance/services/api/internal/domain"
)

func HashSecret(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func GenerateToken() (string, error) {
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return "", err
	}
	return hex.EncodeToString(token), nil
}

func (s *Store) CreateAdminSession(ctx context.Context, token string, ttl time.Duration) error {
	_, err := s.db.ExecContext(ctx, `
		INSERT INTO admin_sessions (token_hash, expires_at)
		VALUES (?, ?)
	`, HashSecret(token), time.Now().UTC().Add(ttl))
	return err
}

func (s *Store) ValidateAdminSession(ctx context.Context, token string) (bool, error) {
	var exists int
	err := s.db.QueryRowContext(ctx, `
		SELECT 1
		FROM admin_sessions
		WHERE token_hash = ? AND expires_at > ?
		LIMIT 1
	`, HashSecret(token), time.Now().UTC()).Scan(&exists)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return true, nil
}

func (s *Store) AdminStatus(ctx context.Context, dbPath string) (domain.AdminStatus, error) {
	status := domain.AdminStatus{
		ServiceStatus: "ok",
		DBPath:        dbPath,
	}

	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM households").Scan(&status.HouseholdCount); err != nil {
		return domain.AdminStatus{}, err
	}
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM members").Scan(&status.MemberCount); err != nil {
		return domain.AdminStatus{}, err
	}
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM expenses WHERE deleted_at IS NULL").Scan(&status.ExpenseCount); err != nil {
		return domain.AdminStatus{}, err
	}

	return status, nil
}

func (s *Store) ExportExpensesCSVRows(ctx context.Context, householdID int64, month string) ([]domain.ExpenseCSVRow, error) {
	if _, err := s.householdByID(ctx, householdID); err != nil {
		return nil, err
	}

	query := `
		SELECT e.spent_at, m.nickname, c.name, e.amount_cents, e.currency, e.note
		FROM expenses e
		INNER JOIN members m ON m.id = e.member_id
		INNER JOIN categories c ON c.id = e.category_id
		WHERE e.household_id = ? AND e.deleted_at IS NULL
	`
	args := []any{householdID}
	if month != "" {
		start, end, err := monthBounds(month)
		if err != nil {
			return nil, err
		}
		query += " AND e.spent_at >= ? AND e.spent_at < ?"
		args = append(args, start, end)
	}
	query += " ORDER BY e.spent_at ASC, e.id ASC"

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	csvRows := []domain.ExpenseCSVRow{}
	for rows.Next() {
		var row domain.ExpenseCSVRow
		var amountCents int64
		if err := rows.Scan(&row.SpentAt, &row.Member, &row.Category, &amountCents, &row.Currency, &row.Note); err != nil {
			return nil, err
		}
		row.Amount = fmt.Sprintf("%d.%02d", amountCents/100, amountCents%100)
		csvRows = append(csvRows, row)
	}

	return csvRows, rows.Err()
}

func (s *Store) CreateHousehold(ctx context.Context, name string) (domain.Household, error) {
	now := time.Now().UTC()
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Household{}, err
	}
	defer tx.Rollback()

	result, err := tx.ExecContext(ctx, `
		INSERT INTO households (name, status, created_at, updated_at)
		VALUES (?, 'active', ?, ?)
	`, name, now, now)
	if err != nil {
		return domain.Household{}, err
	}

	householdID, err := result.LastInsertId()
	if err != nil {
		return domain.Household{}, err
	}

	for _, category := range defaultCategories {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO categories (household_id, name, kind, color, sort_order, status, created_at, updated_at)
			VALUES (?, ?, 'expense', ?, ?, 'active', ?, ?)
		`, householdID, category.name, category.color, category.sortOrder, now, now); err != nil {
			return domain.Household{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return domain.Household{}, err
	}

	return domain.Household{
		ID:        householdID,
		Name:      name,
		Status:    "active",
		CreatedAt: now,
		UpdatedAt: now,
	}, nil
}

func (s *Store) ListHouseholds(ctx context.Context) ([]domain.Household, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, name, status, created_at, updated_at
		FROM households
		ORDER BY id ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	households := []domain.Household{}
	for rows.Next() {
		household, err := scanHousehold(rows)
		if err != nil {
			return nil, err
		}
		households = append(households, household)
	}

	return households, rows.Err()
}

func (s *Store) UpdateHousehold(ctx context.Context, id int64, name string) (domain.Household, error) {
	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, `
		UPDATE households
		SET name = ?, updated_at = ?
		WHERE id = ?
	`, name, now, id)
	if err != nil {
		return domain.Household{}, err
	}
	if err := ensureChanged(result); err != nil {
		return domain.Household{}, err
	}

	return s.householdByID(ctx, id)
}

func (s *Store) CreateInviteCode(ctx context.Context, householdID int64, ttl time.Duration) (domain.InviteCodeWithPlaintext, error) {
	if ttl <= 0 {
		ttl = 7 * 24 * time.Hour
	}
	if _, err := s.householdByID(ctx, householdID); err != nil {
		return domain.InviteCodeWithPlaintext{}, err
	}

	code, err := GenerateToken()
	if err != nil {
		return domain.InviteCodeWithPlaintext{}, err
	}

	now := time.Now().UTC()
	expiresAt := now.Add(ttl)
	result, err := s.db.ExecContext(ctx, `
		INSERT INTO invite_codes (household_id, code_hash, status, expires_at, usage_count, created_at)
		VALUES (?, ?, 'active', ?, 0, ?)
	`, householdID, HashSecret(code), expiresAt, now)
	if err != nil {
		return domain.InviteCodeWithPlaintext{}, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return domain.InviteCodeWithPlaintext{}, err
	}

	return domain.InviteCodeWithPlaintext{
		InviteCode: domain.InviteCode{
			ID:          id,
			HouseholdID: householdID,
			Status:      "active",
			ExpiresAt:   &expiresAt,
			UsageCount:  0,
			CreatedAt:   now,
		},
		Code: code,
	}, nil
}

func (s *Store) DisableInviteCode(ctx context.Context, id int64) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE invite_codes
		SET status = 'disabled'
		WHERE id = ?
	`, id)
	if err != nil {
		return err
	}
	return ensureChanged(result)
}

func (s *Store) UpdateMember(ctx context.Context, id int64, nickname, status string) (domain.Member, error) {
	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, `
		UPDATE members
		SET nickname = ?, status = ?, updated_at = ?
		WHERE id = ?
	`, nickname, status, now, id)
	if err != nil {
		return domain.Member{}, err
	}
	if err := ensureChanged(result); err != nil {
		return domain.Member{}, err
	}

	return s.memberByID(ctx, id)
}

func (s *Store) ListCategories(ctx context.Context, householdID int64) ([]domain.Category, error) {
	if _, err := s.householdByID(ctx, householdID); err != nil {
		return nil, err
	}

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, household_id, name, kind, color, sort_order, status, created_at, updated_at
		FROM categories
		WHERE household_id = ?
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

func (s *Store) CreateCategory(ctx context.Context, householdID int64, input domain.CreateCategoryInput) (domain.Category, error) {
	if input.Kind == "" {
		input.Kind = "expense"
	}
	if input.Color == "" {
		input.Color = "#64748b"
	}
	if _, err := s.householdByID(ctx, householdID); err != nil {
		return domain.Category{}, err
	}

	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, `
		INSERT INTO categories (household_id, name, kind, color, sort_order, status, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
	`, householdID, input.Name, input.Kind, input.Color, input.SortOrder, now, now)
	if err != nil {
		return domain.Category{}, err
	}

	id, err := result.LastInsertId()
	if err != nil {
		return domain.Category{}, err
	}

	return domain.Category{
		ID:          id,
		HouseholdID: householdID,
		Name:        input.Name,
		Kind:        input.Kind,
		Color:       input.Color,
		SortOrder:   input.SortOrder,
		Status:      "active",
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

func (s *Store) UpdateCategory(ctx context.Context, id int64, input domain.CreateCategoryInput) (domain.Category, error) {
	if input.Kind == "" {
		input.Kind = "expense"
	}
	if input.Color == "" {
		input.Color = "#64748b"
	}

	now := time.Now().UTC()
	result, err := s.db.ExecContext(ctx, `
		UPDATE categories
		SET name = ?, kind = ?, color = ?, sort_order = ?, updated_at = ?
		WHERE id = ?
	`, input.Name, input.Kind, input.Color, input.SortOrder, now, id)
	if err != nil {
		return domain.Category{}, err
	}
	if err := ensureChanged(result); err != nil {
		return domain.Category{}, err
	}

	return s.categoryByID(ctx, id)
}

var defaultCategories = []struct {
	name      string
	color     string
	sortOrder int
}{
	{"餐饮", "#dc2626", 10},
	{"购物", "#7c3aed", 20},
	{"交通", "#2563eb", 30},
	{"住房", "#0891b2", 40},
	{"医疗", "#16a34a", 50},
	{"教育", "#ca8a04", 60},
	{"娱乐", "#db2777", 70},
	{"其他", "#64748b", 80},
}

type scanner interface {
	Scan(dest ...any) error
}

func scanHousehold(row scanner) (domain.Household, error) {
	var household domain.Household
	err := row.Scan(&household.ID, &household.Name, &household.Status, &household.CreatedAt, &household.UpdatedAt)
	return household, err
}

func scanMember(row scanner) (domain.Member, error) {
	var member domain.Member
	err := row.Scan(
		&member.ID,
		&member.HouseholdID,
		&member.Nickname,
		&member.SessionTokenHash,
		&member.Status,
		&member.LastActiveAt,
		&member.CreatedAt,
		&member.UpdatedAt,
	)
	return member, err
}

func scanCategory(row scanner) (domain.Category, error) {
	var category domain.Category
	err := row.Scan(
		&category.ID,
		&category.HouseholdID,
		&category.Name,
		&category.Kind,
		&category.Color,
		&category.SortOrder,
		&category.Status,
		&category.CreatedAt,
		&category.UpdatedAt,
	)
	return category, err
}

func (s *Store) householdByID(ctx context.Context, id int64) (domain.Household, error) {
	return scanHousehold(s.db.QueryRowContext(ctx, `
		SELECT id, name, status, created_at, updated_at
		FROM households
		WHERE id = ?
	`, id))
}

func (s *Store) memberByID(ctx context.Context, id int64) (domain.Member, error) {
	return scanMember(s.db.QueryRowContext(ctx, `
		SELECT id, household_id, nickname, session_token_hash, status, last_active_at, created_at, updated_at
		FROM members
		WHERE id = ?
	`, id))
}

func (s *Store) categoryByID(ctx context.Context, id int64) (domain.Category, error) {
	return scanCategory(s.db.QueryRowContext(ctx, `
		SELECT id, household_id, name, kind, color, sort_order, status, created_at, updated_at
		FROM categories
		WHERE id = ?
	`, id))
}

func ensureChanged(result sql.Result) error {
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return sql.ErrNoRows
	}
	return nil
}
