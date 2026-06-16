package store

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"home-finance/services/api/internal/domain"

	_ "modernc.org/sqlite"
)

func TestOpenCreatesMVPDatabaseSchema(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	tables := []string{"households", "members", "invite_codes", "categories", "expenses", "admin_sessions"}
	for _, table := range tables {
		var name string
		err := db.db.QueryRowContext(context.Background(), "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", table).Scan(&name)
		if err != nil {
			t.Fatalf("expected table %s to exist: %v", table, err)
		}
	}

	requiredColumns := map[string][]string{
		"households":     {"status", "updated_at"},
		"members":        {"nickname", "session_token_hash", "status", "last_active_at", "updated_at"},
		"invite_codes":   {"code_hash", "status", "expires_at", "usage_count"},
		"categories":     {"color", "sort_order", "status", "updated_at"},
		"expenses":       {"deleted_at", "updated_at"},
		"admin_sessions": {"token_hash", "expires_at"},
	}
	for table, columns := range requiredColumns {
		actual := tableColumns(t, db.db, table)
		for _, column := range columns {
			if !actual[column] {
				t.Fatalf("expected table %s to have column %s", table, column)
			}
		}
	}

	requiredIndexes := map[string]string{
		"idx_expenses_household_spent_at": "CREATE INDEX idx_expenses_household_spent_at ON expenses(household_id, spent_at DESC)",
		"idx_expenses_household_category": "CREATE INDEX idx_expenses_household_category ON expenses(household_id, category_id)",
		"idx_expenses_household_member":   "CREATE INDEX idx_expenses_household_member ON expenses(household_id, member_id)",
		"idx_members_household_nickname":  "CREATE INDEX idx_members_household_nickname ON members(household_id, nickname)",
		"idx_categories_household_sort":   "CREATE INDEX idx_categories_household_sort ON categories(household_id, sort_order, name)",
	}
	for index, wantSQL := range requiredIndexes {
		var gotSQL string
		err := db.db.QueryRowContext(context.Background(), "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?", index).Scan(&gotSQL)
		if err != nil {
			t.Fatalf("expected index %s to exist: %v", index, err)
		}
		if gotSQL != wantSQL {
			t.Fatalf("index %s SQL = %q, want %q", index, gotSQL, wantSQL)
		}
	}

	var version int
	if err := db.db.QueryRowContext(context.Background(), "PRAGMA user_version").Scan(&version); err != nil {
		t.Fatalf("read user_version: %v", err)
	}
	if version != 1 {
		t.Fatalf("user_version = %d, want 1", version)
	}
}

func TestOpenMigratesInitialSchemaDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.db")
	legacyDB, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open legacy sqlite db: %v", err)
	}
	if _, err := legacyDB.Exec(initialSchema); err != nil {
		t.Fatalf("create legacy schema: %v", err)
	}
	if _, err := legacyDB.Exec(`
		INSERT INTO households (id, name, created_at) VALUES (1, 'Home', CURRENT_TIMESTAMP);
		INSERT INTO members (id, household_id, name, created_at) VALUES (1, 1, 'Alice', CURRENT_TIMESTAMP);
		INSERT INTO categories (id, household_id, name, kind, created_at) VALUES (1, 1, 'Food', 'expense', CURRENT_TIMESTAMP);
	`); err != nil {
		t.Fatalf("seed legacy data: %v", err)
	}
	if _, err := legacyDB.Exec(`
		ALTER TABLE categories ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;
		CREATE INDEX idx_categories_household_sort ON categories(household_id, sort_order);
	`); err != nil {
		t.Fatalf("create stale legacy index: %v", err)
	}
	if err := legacyDB.Close(); err != nil {
		t.Fatalf("close legacy sqlite db: %v", err)
	}

	db, err := Open(path)
	if err != nil {
		t.Fatalf("open migrated store: %v", err)
	}
	defer db.Close()

	members, err := db.ListMembers(context.Background(), 1)
	if err != nil {
		t.Fatalf("list migrated members: %v", err)
	}
	if len(members) != 1 || members[0].Nickname != "Alice" {
		t.Fatalf("migrated members = %#v, want one member with nickname Alice", members)
	}

	created, err := db.CreateExpenseForHousehold(context.Background(), 1, domain.CreateExpenseInput{
		MemberID:    1,
		CategoryID:  1,
		AmountCents: 1234,
		Currency:    "CNY",
		Note:        "lunch",
		SpentAt:     time.Date(2026, 6, 16, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("create expense after migration: %v", err)
	}
	if created.UpdatedAt.IsZero() {
		t.Fatalf("created expense missing updated_at: %#v", created)
	}

	expenses, err := db.ListExpensesForHousehold(context.Background(), 1)
	if err != nil {
		t.Fatalf("list expenses after migration: %v", err)
	}
	if len(expenses) != 1 || expenses[0].Note != "lunch" || expenses[0].UpdatedAt.IsZero() {
		t.Fatalf("migrated expenses = %#v, want created lunch expense with updated_at", expenses)
	}
}

func tableColumns(t *testing.T, db *sql.DB, table string) map[string]bool {
	t.Helper()

	rows, err := db.QueryContext(context.Background(), "PRAGMA table_info("+table+")")
	if err != nil {
		t.Fatalf("read columns for %s: %v", table, err)
	}
	defer rows.Close()

	columns := map[string]bool{}
	for rows.Next() {
		var cid int
		var name, columnType string
		var notNull int
		var defaultValue sql.NullString
		var primaryKey int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &primaryKey); err != nil {
			t.Fatalf("scan column for %s: %v", table, err)
		}
		columns[name] = true
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("read columns for %s: %v", table, err)
	}

	return columns
}

const initialSchema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS households (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS members (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	household_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (household_id) REFERENCES households(id)
);

CREATE TABLE IF NOT EXISTS categories (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	household_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	kind TEXT NOT NULL DEFAULT 'expense',
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (household_id) REFERENCES households(id)
);

CREATE TABLE IF NOT EXISTS expenses (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	household_id INTEGER NOT NULL,
	member_id INTEGER NOT NULL,
	category_id INTEGER NOT NULL,
	amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
	currency TEXT NOT NULL DEFAULT 'CNY',
	note TEXT NOT NULL DEFAULT '',
	spent_at TIMESTAMP NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (household_id) REFERENCES households(id),
	FOREIGN KEY (member_id) REFERENCES members(id),
	FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX IF NOT EXISTS idx_expenses_household_spent_at ON expenses(household_id, spent_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_household_name ON members(household_id, name);
`
