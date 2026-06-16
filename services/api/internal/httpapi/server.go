package httpapi

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"

	"home-finance/services/api/internal/domain"
	"home-finance/services/api/internal/store"
)

type Server struct {
	router *gin.Engine
	store  *store.Store
}

func NewServer(store *store.Store) *Server {
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())

	server := &Server{router: router, store: store}
	server.routes()
	return server
}

func (s *Server) Run(addr string) error {
	return s.router.Run(addr)
}

func (s *Server) Handler() http.Handler {
	return s.router
}

func (s *Server) routes() {
	s.router.GET("/health", s.health)

	api := s.router.Group("/api")
	api.GET("/households/:householdID/members", s.listMembers)
	api.GET("/households/:householdID/expenses", s.listExpenses)
	api.POST("/households/:householdID/expenses", s.createExpense)
}

func (s *Server) health(c *gin.Context) {
	if err := s.store.Health(c.Request.Context()); err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unhealthy"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func (s *Server) listMembers(c *gin.Context) {
	householdID, ok := parseIDParam(c, "householdID")
	if !ok {
		return
	}

	members, err := s.store.ListMembers(c.Request.Context(), householdID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "list members"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": members})
}

func (s *Server) listExpenses(c *gin.Context) {
	householdID, ok := parseIDParam(c, "householdID")
	if !ok {
		return
	}

	expenses, err := s.store.ListExpenses(c.Request.Context(), householdID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "list expenses"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"data": expenses})
}

func (s *Server) createExpense(c *gin.Context) {
	householdID, ok := parseIDParam(c, "householdID")
	if !ok {
		return
	}

	var input domain.CreateExpenseInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid expense payload"})
		return
	}

	expense, err := s.store.CreateExpense(c.Request.Context(), householdID, input)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"data": expense})
}

func parseIDParam(c *gin.Context, name string) (int64, bool) {
	id, err := strconv.ParseInt(c.Param(name), 10, 64)
	if err != nil || id <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid " + name})
		return 0, false
	}
	return id, true
}
