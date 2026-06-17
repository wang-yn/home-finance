package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"home-finance/services/api/internal/domain"

	_ "modernc.org/sqlite"
)

type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	if err := ensureDatabaseParentDir(path); err != nil {
		return nil, err
	}

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

func ensureDatabaseParentDir(path string) error {
	if path == "" || path == ":memory:" || strings.HasPrefix(path, "file:") {
		return nil
	}

	dir := filepath.Dir(path)
	if dir == "." || dir == "" {
		return nil
	}
	return os.MkdirAll(dir, 0o755)
}

func (s *Store) Close() error {
	return s.db.Close()
}

func (s *Store) Health(ctx context.Context) error {
	return s.db.PingContext(ctx)
}

func (s *Store) ListMembers(ctx context.Context, householdID int64) ([]domain.Member, error) {
	if _, err := s.householdByID(ctx, householdID); err != nil {
		return nil, err
	}

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

func (s *Store) migrate(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, schema); err != nil {
		return err
	}
	if err := s.ensureMVPColumns(ctx); err != nil {
		return err
	}
	if err := s.ensureMVPIndexes(ctx); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, "PRAGMA user_version = 1")
	return err
}

func (s *Store) ensureMVPColumns(ctx context.Context) error {
	migrations := []struct {
		table      string
		column     string
		definition string
	}{
		{"households", "status", "TEXT NOT NULL DEFAULT 'active'"},
		{"households", "updated_at", "TIMESTAMP NOT NULL DEFAULT '1970-01-01 00:00:00'"},
		{"members", "nickname", "TEXT"},
		{"members", "session_token_hash", "TEXT NOT NULL DEFAULT ''"},
		{"members", "status", "TEXT NOT NULL DEFAULT 'active'"},
		{"members", "last_active_at", "TIMESTAMP"},
		{"members", "updated_at", "TIMESTAMP NOT NULL DEFAULT '1970-01-01 00:00:00'"},
		{"invite_codes", "code_hash", "TEXT NOT NULL DEFAULT ''"},
		{"invite_codes", "status", "TEXT NOT NULL DEFAULT 'active'"},
		{"invite_codes", "expires_at", "TIMESTAMP"},
		{"invite_codes", "usage_count", "INTEGER NOT NULL DEFAULT 0"},
		{"categories", "color", "TEXT NOT NULL DEFAULT '#64748b'"},
		{"categories", "sort_order", "INTEGER NOT NULL DEFAULT 0"},
		{"categories", "status", "TEXT NOT NULL DEFAULT 'active'"},
		{"categories", "updated_at", "TIMESTAMP NOT NULL DEFAULT '1970-01-01 00:00:00'"},
		{"expenses", "deleted_at", "TIMESTAMP"},
		{"expenses", "updated_at", "TIMESTAMP NOT NULL DEFAULT '1970-01-01 00:00:00'"},
		{"admin_sessions", "token_hash", "TEXT NOT NULL DEFAULT ''"},
		{"admin_sessions", "expires_at", "TIMESTAMP"},
	}

	for _, migration := range migrations {
		exists, err := s.columnExists(ctx, migration.table, migration.column)
		if err != nil {
			return err
		}
		if exists {
			continue
		}
		if _, err := s.db.ExecContext(ctx, fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", migration.table, migration.column, migration.definition)); err != nil {
			return err
		}
	}

	hasName, err := s.columnExists(ctx, "members", "name")
	if err != nil {
		return err
	}
	if hasName {
		if _, err := s.db.ExecContext(ctx, "UPDATE members SET nickname = name WHERE nickname IS NULL OR nickname = ''"); err != nil {
			return err
		}
	}

	_, err = s.db.ExecContext(ctx, `
		UPDATE households SET updated_at = created_at WHERE updated_at = '1970-01-01 00:00:00';
		UPDATE members SET updated_at = created_at WHERE updated_at = '1970-01-01 00:00:00';
		UPDATE categories SET updated_at = created_at WHERE updated_at = '1970-01-01 00:00:00';
		UPDATE expenses SET updated_at = created_at WHERE updated_at = '1970-01-01 00:00:00';
	`)
	return err
}

func (s *Store) ensureMVPIndexes(ctx context.Context) error {
	indexes := []struct {
		name string
		sql  string
	}{
		{"idx_expenses_household_spent_at", "CREATE INDEX IF NOT EXISTS idx_expenses_household_spent_at ON expenses(household_id, spent_at DESC)"},
		{"idx_expenses_household_category", "CREATE INDEX IF NOT EXISTS idx_expenses_household_category ON expenses(household_id, category_id)"},
		{"idx_expenses_household_member", "CREATE INDEX IF NOT EXISTS idx_expenses_household_member ON expenses(household_id, member_id)"},
		{"idx_members_household_nickname", "CREATE INDEX IF NOT EXISTS idx_members_household_nickname ON members(household_id, nickname)"},
		{"idx_categories_household_sort", "CREATE INDEX IF NOT EXISTS idx_categories_household_sort ON categories(household_id, sort_order, name)"},
	}

	for _, index := range indexes {
		var existingSQL string
		err := s.db.QueryRowContext(ctx, "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?", index.name).Scan(&existingSQL)
		if err != nil && !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if err == nil && !sameSQL(existingSQL, index.sql) {
			if _, err := s.db.ExecContext(ctx, "DROP INDEX "+index.name); err != nil {
				return err
			}
		}
		if _, err := s.db.ExecContext(ctx, index.sql); err != nil {
			return err
		}
	}

	return nil
}

func (s *Store) columnExists(ctx context.Context, table, column string) (bool, error) {
	rows, err := s.db.QueryContext(ctx, "PRAGMA table_info("+table+")")
	if err != nil {
		return false, err
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name, columnType string
		var notNull int
		var defaultValue sql.NullString
		var primaryKey int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			return false, err
		}
		if name == column {
			return true, nil
		}
	}

	return false, rows.Err()
}

func sameSQL(a, b string) bool {
	return strings.Join(strings.Fields(a), " ") == strings.Join(strings.Fields(b), " ")
}
