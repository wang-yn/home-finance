package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
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
