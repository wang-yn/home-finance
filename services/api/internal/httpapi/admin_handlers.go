package httpapi

import (
	"crypto/subtle"
	"database/sql"
	"encoding/csv"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"home-finance/services/api/internal/domain"
	"home-finance/services/api/internal/store"
)

const adminLoginFailureLimit = 3

type adminLoginFailure struct {
	count       int
	lockedUntil time.Time
}

func (s *Server) adminLogin(c *gin.Context) {
	if s.config.AdminPassword == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "admin password is not configured"})
		return
	}

	var input struct {
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid login payload"})
		return
	}
	clientIP := c.ClientIP()
	if s.isAdminLoginLocked(clientIP) {
		c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many login attempts"})
		return
	}

	validPassword := subtle.ConstantTimeCompare([]byte(store.HashSecret(input.Password)), []byte(store.HashSecret(s.config.AdminPassword))) == 1
	if !validPassword {
		if s.recordAdminLoginFailure(clientIP) {
			c.JSON(http.StatusTooManyRequests, gin.H{"error": "too many login attempts"})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	s.resetAdminLoginFailures(clientIP)

	token, err := store.GenerateToken()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "generate token"})
		return
	}
	if err := s.store.CreateAdminSession(c.Request.Context(), token, 24*time.Hour); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create admin session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"token": token}})
}

func (s *Server) recordAdminLoginFailure(clientIP string) bool {
	s.adminLoginMu.Lock()
	defer s.adminLoginMu.Unlock()

	failure := s.adminLoginFailures[clientIP]
	failure.count++
	if failure.count > adminLoginFailureLimit {
		failure.lockedUntil = time.Now().UTC().Add(s.config.AdminLoginLockoutDuration)
		s.adminLoginFailures[clientIP] = failure
		return true
	}

	s.adminLoginFailures[clientIP] = failure
	return false
}

func (s *Server) isAdminLoginLocked(clientIP string) bool {
	s.adminLoginMu.Lock()
	defer s.adminLoginMu.Unlock()

	failure, ok := s.adminLoginFailures[clientIP]
	if !ok || failure.lockedUntil.IsZero() {
		return false
	}
	if time.Now().UTC().Before(failure.lockedUntil) {
		return true
	}

	delete(s.adminLoginFailures, clientIP)
	return false
}

func (s *Server) resetAdminLoginFailures(clientIP string) {
	s.adminLoginMu.Lock()
	defer s.adminLoginMu.Unlock()

	delete(s.adminLoginFailures, clientIP)
}

func (s *Server) adminStatus(c *gin.Context) {
	status, err := s.store.AdminStatus(c.Request.Context(), s.config.DBPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "admin status"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": status})
}

func (s *Server) adminExportExpensesCSV(c *gin.Context) {
	householdIDText := strings.TrimSpace(c.Query("householdId"))
	householdID, err := strconv.ParseInt(householdIDText, 10, 64)
	if err != nil || householdID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid householdId"})
		return
	}

	rows, err := s.store.ExportExpensesCSVRows(c.Request.Context(), householdID, c.Query("month"))
	if err != nil {
		if strings.Contains(err.Error(), "invalid month") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		writeAdminStoreError(c, err, "export expenses")
		return
	}

	c.Header("Content-Type", "text/csv; charset=utf-8")
	c.Header("Content-Disposition", `attachment; filename="expenses.csv"`)
	writer := csv.NewWriter(c.Writer)
	if err := writer.Write([]string{"spent_at", "member", "category", "amount", "currency", "note"}); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	for _, row := range rows {
		if err := writer.Write([]string{
			row.SpentAt.Format(time.RFC3339),
			escapeSpreadsheetCell(row.Member),
			escapeSpreadsheetCell(row.Category),
			row.Amount,
			escapeSpreadsheetCell(row.Currency),
			escapeSpreadsheetCell(row.Note),
		}); err != nil {
			c.Status(http.StatusInternalServerError)
			return
		}
	}
	writer.Flush()
	if err := writer.Error(); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
}

func escapeSpreadsheetCell(value string) string {
	if value == "" {
		return value
	}
	switch value[0] {
	case '=', '+', '-', '@', '\t', '\r':
		return "'" + value
	default:
		return value
	}
}

func (s *Server) adminListHouseholds(c *gin.Context) {
	households, err := s.store.ListHouseholds(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "list households"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": households})
}

func (s *Server) adminCreateHousehold(c *gin.Context) {
	var input struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid household payload"})
		return
	}

	household, err := s.store.CreateHousehold(c.Request.Context(), input.Name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "create household"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": household})
}

func (s *Server) adminUpdateHousehold(c *gin.Context) {
	householdID, ok := parseIDParam(c, "householdID")
	if !ok {
		return
	}

	var input struct {
		Name string `json:"name" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid household payload"})
		return
	}

	household, err := s.store.UpdateHousehold(c.Request.Context(), householdID, input.Name)
	if err != nil {
		writeAdminStoreError(c, err, "update household")
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": household})
}

func (s *Server) adminCreateInviteCode(c *gin.Context) {
	householdID, ok := parseIDParam(c, "householdID")
	if !ok {
		return
	}

	var input struct {
		TTLDays int `json:"ttlDays"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid invite code payload"})
		return
	}

	var ttl time.Duration
	if input.TTLDays > 0 {
		ttl = time.Duration(input.TTLDays) * 24 * time.Hour
	}

	inviteCode, err := s.store.CreateInviteCode(c.Request.Context(), householdID, ttl)
	if err != nil {
		writeAdminStoreError(c, err, "create invite code")
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": inviteCode})
}

func (s *Server) adminDisableInviteCode(c *gin.Context) {
	inviteCodeID, ok := parseIDParam(c, "inviteCodeID")
	if !ok {
		return
	}

	var input struct {
		Status string `json:"status"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid invite code payload"})
		return
	}
	if input.Status != "" && input.Status != "disabled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid invite code status"})
		return
	}

	if err := s.store.DisableInviteCode(c.Request.Context(), inviteCodeID); err != nil {
		writeAdminStoreError(c, err, "disable invite code")
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"id": inviteCodeID, "status": "disabled"}})
}

func (s *Server) adminListInviteCodes(c *gin.Context) {
	householdID, ok := parseIDParam(c, "householdID")
	if !ok {
		return
	}

	inviteCodes, err := s.store.ListInviteCodes(c.Request.Context(), householdID)
	if err != nil {
		writeAdminStoreError(c, err, "list invite codes")
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": inviteCodes})
}

func (s *Server) adminListMembers(c *gin.Context) {
	householdID, ok := parseIDParam(c, "householdID")
	if !ok {
		return
	}

	members, err := s.store.ListMembers(c.Request.Context(), householdID)
	if err != nil {
		writeAdminStoreError(c, err, "list members")
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": members})
}

func (s *Server) adminUpdateMember(c *gin.Context) {
	memberID, ok := parseIDParam(c, "memberID")
	if !ok {
		return
	}

	var input struct {
		Nickname string `json:"nickname" binding:"required"`
		Status   string `json:"status" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid member payload"})
		return
	}
	if input.Status != "active" && input.Status != "disabled" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid member status"})
		return
	}

	member, err := s.store.UpdateMember(c.Request.Context(), memberID, input.Nickname, input.Status)
	if err != nil {
		writeAdminStoreError(c, err, "update member")
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": member})
}

func (s *Server) adminListCategories(c *gin.Context) {
	householdID, ok := parseIDParam(c, "householdID")
	if !ok {
		return
	}

	categories, err := s.store.ListCategories(c.Request.Context(), householdID)
	if err != nil {
		writeAdminStoreError(c, err, "list categories")
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": categories})
}

func (s *Server) adminCreateCategory(c *gin.Context) {
	householdID, ok := parseIDParam(c, "householdID")
	if !ok {
		return
	}

	var input struct {
		Name      string `json:"name" binding:"required"`
		Kind      string `json:"kind"`
		Color     string `json:"color"`
		SortOrder int    `json:"sortOrder"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid category payload"})
		return
	}

	category, err := s.store.CreateCategory(c.Request.Context(), householdID, domain.CreateCategoryInput{
		HouseholdID: householdID,
		Name:        input.Name,
		Kind:        input.Kind,
		Color:       input.Color,
		SortOrder:   input.SortOrder,
	})
	if err != nil {
		writeAdminStoreError(c, err, "create category")
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": category})
}

func (s *Server) adminUpdateCategory(c *gin.Context) {
	categoryID, ok := parseIDParam(c, "categoryID")
	if !ok {
		return
	}

	var input struct {
		Name      string `json:"name" binding:"required"`
		Kind      string `json:"kind"`
		Color     string `json:"color"`
		SortOrder int    `json:"sortOrder"`
		Status    string `json:"status"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid category payload"})
		return
	}

	category, err := s.store.UpdateCategory(c.Request.Context(), categoryID, domain.CreateCategoryInput{
		Name:      input.Name,
		Kind:      input.Kind,
		Color:     input.Color,
		SortOrder: input.SortOrder,
		Status:    input.Status,
	})
	if err != nil {
		writeAdminStoreError(c, err, "update category")
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": category})
}

func writeAdminStoreError(c *gin.Context, err error, message string) {
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": message})
		return
	}

	c.JSON(http.StatusInternalServerError, gin.H{"error": message})
}

func (s *Server) requireAdmin() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := bearerToken(c.GetHeader("Authorization"))
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		ok, err := s.store.ValidateAdminSession(c.Request.Context(), token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "validate admin session"})
			return
		}
		if !ok {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		c.Next()
	}
}

func bearerToken(header string) string {
	const prefix = "Bearer "
	if !strings.HasPrefix(header, prefix) {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, prefix))
}
