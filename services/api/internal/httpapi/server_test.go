package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"home-finance/services/api/internal/store"
)

func TestHealthReturnsOK(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db)
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", response.Code, response.Body.String())
	}
}

func TestAdminLoginAndStatus(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db, Config{AdminPassword: "secret"})

	loginRequest := httptest.NewRequest(http.MethodPost, "/admin/login", strings.NewReader(`{"password":"secret"}`))
	loginRequest.Header.Set("Content-Type", "application/json")
	loginResponse := httptest.NewRecorder()

	server.Handler().ServeHTTP(loginResponse, loginRequest)

	if loginResponse.Code != http.StatusOK {
		t.Fatalf("expected login 200, got %d: %s", loginResponse.Code, loginResponse.Body.String())
	}

	var loginPayload struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.NewDecoder(loginResponse.Body).Decode(&loginPayload); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	if loginPayload.Data.Token == "" {
		t.Fatal("expected non-empty admin token")
	}

	statusRequest := httptest.NewRequest(http.MethodGet, "/admin/status", nil)
	statusRequest.Header.Set("Authorization", "Bearer "+loginPayload.Data.Token)
	statusResponse := httptest.NewRecorder()

	server.Handler().ServeHTTP(statusResponse, statusRequest)

	if statusResponse.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", statusResponse.Code, statusResponse.Body.String())
	}
}
