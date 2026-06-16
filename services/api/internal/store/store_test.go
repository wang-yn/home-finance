package store

import (
	"context"
	"testing"
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
}
