package httpapi

import (
	"crypto/subtle"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"

	"home-finance/services/api/internal/store"
)

const adminLoginFailureLimit = 3

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

	s.adminLoginFailures[clientIP]++
	return s.adminLoginFailures[clientIP] > adminLoginFailureLimit
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
