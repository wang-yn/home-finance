package httpapi

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"

	"home-finance/services/api/internal/domain"
)

const memberSessionContextKey = "memberSession"

func (s *Server) join(c *gin.Context) {
	var input struct {
		InviteCode string `json:"inviteCode" binding:"required"`
		Nickname   string `json:"nickname" binding:"required"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid join payload"})
		return
	}

	if strings.TrimSpace(input.Nickname) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "nickname is required"})
		return
	}

	result, err := s.store.JoinHousehold(c.Request.Context(), input.InviteCode, input.Nickname)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid invite code"})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": "join household"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": result})
}

func (s *Server) me(c *gin.Context) {
	session, ok := memberSession(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "member session"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": session})
}

func (s *Server) listCategories(c *gin.Context) {
	session, ok := memberSession(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "member session"})
		return
	}

	categories, err := s.store.ListActiveCategories(c.Request.Context(), session.Household.ID)
	if err != nil {
		writeMemberStoreError(c, err, "list categories")
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": categories})
}

func (s *Server) listExpenses(c *gin.Context) {
	session, ok := memberSession(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "member session"})
		return
	}

	filter, ok := expenseFilterFromQuery(c)
	if !ok {
		return
	}
	expenses, err := s.store.ListExpenses(c.Request.Context(), session, filter)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": expenses})
}

func (s *Server) createExpense(c *gin.Context) {
	session, ok := memberSession(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "member session"})
		return
	}

	var input domain.CreateExpenseInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid expense payload"})
		return
	}

	expense, err := s.store.CreateExpense(c.Request.Context(), session, input)
	if err != nil {
		writeMemberStoreError(c, err, "create expense")
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": expense})
}

func (s *Server) updateExpense(c *gin.Context) {
	session, ok := memberSession(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "member session"})
		return
	}
	expenseID, ok := parseIDParam(c, "expenseID")
	if !ok {
		return
	}

	var input domain.UpdateExpenseInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid expense payload"})
		return
	}

	expense, err := s.store.UpdateExpense(c.Request.Context(), session, expenseID, input)
	if err != nil {
		writeMemberStoreError(c, err, "update expense")
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": expense})
}

func (s *Server) deleteExpense(c *gin.Context) {
	session, ok := memberSession(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "member session"})
		return
	}
	expenseID, ok := parseIDParam(c, "expenseID")
	if !ok {
		return
	}

	if err := s.store.DeleteExpense(c.Request.Context(), session, expenseID); err != nil {
		writeMemberStoreError(c, err, "delete expense")
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": gin.H{"id": expenseID, "deleted": true}})
}

func (s *Server) monthlyAnalytics(c *gin.Context) {
	session, ok := memberSession(c)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "member session"})
		return
	}

	summary, err := s.store.MonthlyAnalytics(c.Request.Context(), session, c.Query("month"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": summary})
}

func (s *Server) requireHouseholdMember() gin.HandlerFunc {
	return func(c *gin.Context) {
		session, ok := memberSession(c)
		if !ok {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "member session"})
			return
		}

		householdID, ok := parseIDParam(c, "householdID")
		if !ok {
			c.Abort()
			return
		}
		if session.Household.ID != householdID {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}

		c.Next()
	}
}

func (s *Server) requireMember() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := bearerToken(c.GetHeader("Authorization"))
		if token == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		session, err := s.store.MemberBySessionToken(c.Request.Context(), token)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
				return
			}
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "validate member session"})
			return
		}

		c.Set(memberSessionContextKey, session)
		c.Next()
	}
}

func memberSession(c *gin.Context) (domain.MemberSession, bool) {
	value, ok := c.Get(memberSessionContextKey)
	if !ok {
		return domain.MemberSession{}, false
	}
	session, ok := value.(domain.MemberSession)
	return session, ok
}

func writeMemberStoreError(c *gin.Context, err error, message string) {
	if errors.Is(err, sql.ErrNoRows) {
		c.JSON(http.StatusNotFound, gin.H{"error": message})
		return
	}
	if strings.Contains(err.Error(), "invalid month") {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusInternalServerError, gin.H{"error": message})
}

func expenseFilterFromQuery(c *gin.Context) (domain.ExpenseFilter, bool) {
	filter := domain.ExpenseFilter{Month: c.Query("month")}
	if categoryIDText := strings.TrimSpace(c.Query("categoryId")); categoryIDText != "" {
		categoryID, err := strconv.ParseInt(categoryIDText, 10, 64)
		if err != nil || categoryID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid categoryId"})
			return domain.ExpenseFilter{}, false
		}
		filter.CategoryID = categoryID
	}
	if memberIDText := strings.TrimSpace(c.Query("memberId")); memberIDText != "" {
		memberID, err := strconv.ParseInt(memberIDText, 10, 64)
		if err != nil || memberID <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid memberId"})
			return domain.ExpenseFilter{}, false
		}
		filter.MemberID = memberID
	}
	return filter, true
}
