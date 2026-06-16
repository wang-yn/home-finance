package httpapi

import (
	"database/sql"
	"errors"
	"net/http"
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
