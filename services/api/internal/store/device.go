package store

import (
	"context"
	"database/sql"
	"errors"
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

	if _, err := tx.ExecContext(ctx, `
		UPDATE invite_codes
		SET usage_count = usage_count + 1
		WHERE id = ?
	`, invite.ID); err != nil {
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
