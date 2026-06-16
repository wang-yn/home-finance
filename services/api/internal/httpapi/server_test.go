package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

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

func TestAdminLoginWrongPasswordIsThrottledAndSuccessResetsFailures(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db, Config{AdminPassword: "secret"})

	for attempt := 1; attempt <= adminLoginFailureLimit; attempt++ {
		response := postAdminLogin(server, "wrong")
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d expected 401, got %d: %s", attempt, response.Code, response.Body.String())
		}
	}

	throttledResponse := postAdminLogin(server, "wrong")
	if throttledResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 after threshold, got %d: %s", throttledResponse.Code, throttledResponse.Body.String())
	}

	resetResponse := postAdminLogin(server, "secret")
	if resetResponse.Code != http.StatusOK {
		t.Fatalf("expected successful login to reset throttled client, got %d: %s", resetResponse.Code, resetResponse.Body.String())
	}

	afterThrottleResetResponse := postAdminLogin(server, "wrong")
	if afterThrottleResetResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expected reset throttled client to get 401 on next wrong password, got %d: %s", afterThrottleResetResponse.Code, afterThrottleResetResponse.Body.String())
	}

	successServer := NewServer(db, Config{AdminPassword: "secret"})
	for attempt := 1; attempt < adminLoginFailureLimit; attempt++ {
		response := postAdminLogin(successServer, "wrong")
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("pre-success attempt %d expected 401, got %d: %s", attempt, response.Code, response.Body.String())
		}
	}

	successResponse := postAdminLogin(successServer, "secret")
	if successResponse.Code != http.StatusOK {
		t.Fatalf("expected successful login 200, got %d: %s", successResponse.Code, successResponse.Body.String())
	}

	afterResetResponse := postAdminLogin(successServer, "wrong")
	if afterResetResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expected failure count reset after success, got %d: %s", afterResetResponse.Code, afterResetResponse.Body.String())
	}
}

func TestAdminLoginWithoutConfiguredPasswordReturns500(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db)
	response := postAdminLogin(server, "secret")

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500, got %d: %s", response.Code, response.Body.String())
	}
}

func TestAdminStatusRequiresBearerToken(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db, Config{AdminPassword: "secret"})

	missingTokenRequest := httptest.NewRequest(http.MethodGet, "/admin/status", nil)
	missingTokenResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(missingTokenResponse, missingTokenRequest)
	if missingTokenResponse.Code != http.StatusUnauthorized {
		t.Fatalf("missing bearer expected 401, got %d: %s", missingTokenResponse.Code, missingTokenResponse.Body.String())
	}

	invalidTokenRequest := httptest.NewRequest(http.MethodGet, "/admin/status", nil)
	invalidTokenRequest.Header.Set("Authorization", "Bearer invalid")
	invalidTokenResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(invalidTokenResponse, invalidTokenRequest)
	if invalidTokenResponse.Code != http.StatusUnauthorized {
		t.Fatalf("invalid bearer expected 401, got %d: %s", invalidTokenResponse.Code, invalidTokenResponse.Body.String())
	}
}

func TestExpiredAdminSessionIsRejected(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	if err := db.CreateAdminSession(context.Background(), "expired-token", -time.Hour); err != nil {
		t.Fatalf("create expired admin session: %v", err)
	}

	ok, err := db.ValidateAdminSession(context.Background(), "expired-token")
	if err != nil {
		t.Fatalf("validate expired admin session: %v", err)
	}
	if ok {
		t.Fatal("expected expired admin session to be rejected")
	}
}

func postAdminLogin(server *Server, password string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, "/admin/login", strings.NewReader(`{"password":"`+password+`"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	return response
}
