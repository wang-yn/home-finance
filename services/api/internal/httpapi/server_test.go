package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strconv"
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

func TestAdminCanManageHouseholdInviteMemberAndCategory(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db, Config{AdminPassword: "secret"})
	token := loginAdmin(t, server)

	createHouseholdResponse := adminJSONRequest(t, server, token, http.MethodPost, "/admin/households", `{"name":"Home"}`)
	if createHouseholdResponse.Code != http.StatusCreated {
		t.Fatalf("expected create household 201, got %d: %s", createHouseholdResponse.Code, createHouseholdResponse.Body.String())
	}
	var createHouseholdPayload struct {
		Data struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		} `json:"data"`
	}
	decodeJSON(t, createHouseholdResponse, &createHouseholdPayload)
	if createHouseholdPayload.Data.ID == 0 || createHouseholdPayload.Data.Name != "Home" {
		t.Fatalf("unexpected household response: %#v", createHouseholdPayload.Data)
	}
	householdID := createHouseholdPayload.Data.ID

	createInviteCodeResponse := adminJSONRequest(t, server, token, http.MethodPost, "/admin/households/"+strconv.FormatInt(householdID, 10)+"/invite-codes", `{}`)
	if createInviteCodeResponse.Code != http.StatusCreated {
		t.Fatalf("expected create invite code 201, got %d: %s", createInviteCodeResponse.Code, createInviteCodeResponse.Body.String())
	}
	var createInviteCodePayload struct {
		Data struct {
			ID   int64  `json:"id"`
			Code string `json:"code"`
		} `json:"data"`
	}
	decodeJSON(t, createInviteCodeResponse, &createInviteCodePayload)
	if createInviteCodePayload.Data.ID == 0 || createInviteCodePayload.Data.Code == "" {
		t.Fatalf("unexpected invite code response: %#v", createInviteCodePayload.Data)
	}

	listHouseholdsResponse := adminJSONRequest(t, server, token, http.MethodGet, "/admin/households", "")
	if listHouseholdsResponse.Code != http.StatusOK {
		t.Fatalf("expected list households 200, got %d: %s", listHouseholdsResponse.Code, listHouseholdsResponse.Body.String())
	}
	var listHouseholdsPayload struct {
		Data []struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		} `json:"data"`
	}
	decodeJSON(t, listHouseholdsResponse, &listHouseholdsPayload)
	if len(listHouseholdsPayload.Data) != 1 || listHouseholdsPayload.Data[0].ID != householdID || listHouseholdsPayload.Data[0].Name != "Home" {
		t.Fatalf("unexpected households response: %#v", listHouseholdsPayload.Data)
	}

	createCategoryResponse := adminJSONRequest(t, server, token, http.MethodPost, "/admin/households/"+strconv.FormatInt(householdID, 10)+"/categories", `{"name":"Coffee","color":"#7c2d12","sortOrder":10}`)
	if createCategoryResponse.Code != http.StatusCreated {
		t.Fatalf("expected create category 201, got %d: %s", createCategoryResponse.Code, createCategoryResponse.Body.String())
	}
	var createCategoryPayload struct {
		Data struct {
			ID        int64  `json:"id"`
			Name      string `json:"name"`
			Color     string `json:"color"`
			SortOrder int    `json:"sortOrder"`
		} `json:"data"`
	}
	decodeJSON(t, createCategoryResponse, &createCategoryPayload)
	if createCategoryPayload.Data.ID == 0 || createCategoryPayload.Data.Name != "Coffee" || createCategoryPayload.Data.Color != "#7c2d12" || createCategoryPayload.Data.SortOrder != 10 {
		t.Fatalf("unexpected category response: %#v", createCategoryPayload.Data)
	}

	listCategoriesResponse := adminJSONRequest(t, server, token, http.MethodGet, "/admin/households/"+strconv.FormatInt(householdID, 10)+"/categories", "")
	if listCategoriesResponse.Code != http.StatusOK {
		t.Fatalf("expected list categories 200, got %d: %s", listCategoriesResponse.Code, listCategoriesResponse.Body.String())
	}
	var listCategoriesPayload struct {
		Data []struct {
			Name string `json:"name"`
		} `json:"data"`
	}
	decodeJSON(t, listCategoriesResponse, &listCategoriesPayload)
	if len(listCategoriesPayload.Data) != 9 {
		t.Fatalf("expected default categories plus Coffee, got %#v", listCategoriesPayload.Data)
	}
	foundCoffee := false
	for _, category := range listCategoriesPayload.Data {
		if category.Name == "Coffee" {
			foundCoffee = true
			break
		}
	}
	if !foundCoffee {
		t.Fatalf("expected Coffee in categories, got %#v", listCategoriesPayload.Data)
	}
}

func TestDeviceCanJoinHouseholdWithInviteCode(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db, Config{AdminPassword: "secret"})
	token := loginAdmin(t, server)

	createHouseholdResponse := adminJSONRequest(t, server, token, http.MethodPost, "/admin/households", `{"name":"Home"}`)
	if createHouseholdResponse.Code != http.StatusCreated {
		t.Fatalf("expected create household 201, got %d: %s", createHouseholdResponse.Code, createHouseholdResponse.Body.String())
	}
	var createHouseholdPayload struct {
		Data struct {
			ID int64 `json:"id"`
		} `json:"data"`
	}
	decodeJSON(t, createHouseholdResponse, &createHouseholdPayload)
	householdID := createHouseholdPayload.Data.ID
	if householdID == 0 {
		t.Fatalf("expected household id, got %#v", createHouseholdPayload.Data)
	}

	createInviteCodeResponse := adminJSONRequest(t, server, token, http.MethodPost, "/admin/households/"+strconv.FormatInt(householdID, 10)+"/invite-codes", `{}`)
	if createInviteCodeResponse.Code != http.StatusCreated {
		t.Fatalf("expected create invite code 201, got %d: %s", createInviteCodeResponse.Code, createInviteCodeResponse.Body.String())
	}
	var createInviteCodePayload struct {
		Data struct {
			Code string `json:"code"`
		} `json:"data"`
	}
	decodeJSON(t, createInviteCodeResponse, &createInviteCodePayload)
	if createInviteCodePayload.Data.Code == "" {
		t.Fatal("expected plaintext invite code")
	}

	joinRequest := httptest.NewRequest(http.MethodPost, "/api/join", strings.NewReader(`{"inviteCode":"`+createInviteCodePayload.Data.Code+`","nickname":"小王"}`))
	joinRequest.Header.Set("Content-Type", "application/json")
	joinResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(joinResponse, joinRequest)
	if joinResponse.Code != http.StatusOK {
		t.Fatalf("expected join 200, got %d: %s", joinResponse.Code, joinResponse.Body.String())
	}
	var joinPayload struct {
		Data struct {
			Household struct {
				ID int64 `json:"id"`
			} `json:"household"`
			Member struct {
				ID          int64  `json:"id"`
				HouseholdID int64  `json:"householdId"`
				Nickname    string `json:"nickname"`
			} `json:"member"`
			Token string `json:"token"`
		} `json:"data"`
	}
	decodeJSON(t, joinResponse, &joinPayload)
	if joinPayload.Data.Household.ID != householdID {
		t.Fatalf("expected household id %d, got %#v", householdID, joinPayload.Data.Household)
	}
	if joinPayload.Data.Member.ID == 0 || joinPayload.Data.Member.HouseholdID != householdID || joinPayload.Data.Member.Nickname != "小王" {
		t.Fatalf("unexpected member response: %#v", joinPayload.Data.Member)
	}
	if joinPayload.Data.Token == "" {
		t.Fatal("expected non-empty member token")
	}

	meRequest := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	meRequest.Header.Set("Authorization", "Bearer "+joinPayload.Data.Token)
	meResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(meResponse, meRequest)
	if meResponse.Code != http.StatusOK {
		t.Fatalf("expected me 200, got %d: %s", meResponse.Code, meResponse.Body.String())
	}
	var mePayload struct {
		Data struct {
			Household struct {
				ID int64 `json:"id"`
			} `json:"household"`
			Member struct {
				ID          int64  `json:"id"`
				HouseholdID int64  `json:"householdId"`
				Nickname    string `json:"nickname"`
			} `json:"member"`
		} `json:"data"`
	}
	decodeJSON(t, meResponse, &mePayload)
	if mePayload.Data.Household.ID != householdID {
		t.Fatalf("expected me household id %d, got %#v", householdID, mePayload.Data.Household)
	}
	if mePayload.Data.Member.ID != joinPayload.Data.Member.ID || mePayload.Data.Member.HouseholdID != householdID || mePayload.Data.Member.Nickname != "小王" {
		t.Fatalf("unexpected me member response: %#v", mePayload.Data.Member)
	}
}

func TestJoinRejectsInvalidDisabledAndExpiredInviteCodes(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "api.db")
	db, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db, Config{AdminPassword: "secret"})
	adminToken := loginAdmin(t, server)

	invalidResponse := postJoin(server, "not-an-invite", "小王")
	if invalidResponse.Code != http.StatusUnauthorized {
		t.Fatalf("invalid invite expected 401, got %d: %s", invalidResponse.Code, invalidResponse.Body.String())
	}

	_, inviteID, inviteCode := createHouseholdInvite(t, server, adminToken, "Home")
	disableResponse := adminJSONRequest(t, server, adminToken, http.MethodPatch, "/admin/invite-codes/"+strconv.FormatInt(inviteID, 10), `{"status":"disabled"}`)
	if disableResponse.Code != http.StatusOK {
		t.Fatalf("expected disable invite 200, got %d: %s", disableResponse.Code, disableResponse.Body.String())
	}
	disabledResponse := postJoin(server, inviteCode, "小王")
	if disabledResponse.Code != http.StatusUnauthorized {
		t.Fatalf("disabled invite expected 401, got %d: %s", disabledResponse.Code, disabledResponse.Body.String())
	}

	_, expiredInviteID, expiredInviteCode := createHouseholdInvite(t, server, adminToken, "Expired Home")
	rawDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open raw sqlite db: %v", err)
	}
	defer rawDB.Close()
	if _, err := rawDB.ExecContext(context.Background(), "UPDATE invite_codes SET expires_at = ? WHERE id = ?", time.Now().UTC().Add(-time.Hour), expiredInviteID); err != nil {
		t.Fatalf("expire invite code: %v", err)
	}
	expiredResponse := postJoin(server, expiredInviteCode, "小王")
	if expiredResponse.Code != http.StatusUnauthorized {
		t.Fatalf("expired invite expected 401, got %d: %s", expiredResponse.Code, expiredResponse.Body.String())
	}
}

func TestMemberSessionRejectsMissingInvalidDisabledAndInactive(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "api.db")
	db, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db, Config{AdminPassword: "secret"})
	adminToken := loginAdmin(t, server)
	_, _, inviteCode := createHouseholdInvite(t, server, adminToken, "Home")

	missingBearerRequest := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	missingBearerResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(missingBearerResponse, missingBearerRequest)
	if missingBearerResponse.Code != http.StatusUnauthorized {
		t.Fatalf("missing bearer expected 401, got %d: %s", missingBearerResponse.Code, missingBearerResponse.Body.String())
	}

	invalidBearerRequest := httptest.NewRequest(http.MethodGet, "/api/me", nil)
	invalidBearerRequest.Header.Set("Authorization", "Bearer invalid")
	invalidBearerResponse := httptest.NewRecorder()
	server.Handler().ServeHTTP(invalidBearerResponse, invalidBearerRequest)
	if invalidBearerResponse.Code != http.StatusUnauthorized {
		t.Fatalf("invalid bearer expected 401, got %d: %s", invalidBearerResponse.Code, invalidBearerResponse.Body.String())
	}

	joinPayload := joinDevice(t, server, inviteCode, "小王")
	disableMemberResponse := adminJSONRequest(t, server, adminToken, http.MethodPatch, "/admin/members/"+strconv.FormatInt(joinPayload.MemberID, 10), `{"nickname":"小王","status":"disabled"}`)
	if disableMemberResponse.Code != http.StatusOK {
		t.Fatalf("expected disable member 200, got %d: %s", disableMemberResponse.Code, disableMemberResponse.Body.String())
	}
	disabledMemberResponse := memberGET(server, "/api/me", joinPayload.Token)
	if disabledMemberResponse.Code != http.StatusUnauthorized {
		t.Fatalf("disabled member token expected 401, got %d: %s", disabledMemberResponse.Code, disabledMemberResponse.Body.String())
	}

	_, _, activeInviteCode := createHouseholdInvite(t, server, adminToken, "Inactive Home")
	activeJoinPayload := joinDevice(t, server, activeInviteCode, "小李")
	rawDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open raw sqlite db: %v", err)
	}
	defer rawDB.Close()
	if _, err := rawDB.ExecContext(context.Background(), "UPDATE households SET status = 'disabled' WHERE id = ?", activeJoinPayload.HouseholdID); err != nil {
		t.Fatalf("disable household: %v", err)
	}
	inactiveHouseholdResponse := memberGET(server, "/api/me", activeJoinPayload.Token)
	if inactiveHouseholdResponse.Code != http.StatusUnauthorized {
		t.Fatalf("inactive household token expected 401, got %d: %s", inactiveHouseholdResponse.Code, inactiveHouseholdResponse.Body.String())
	}
}

func TestLegacyFinanceRoutesRequireMemberSessionAndMatchingHousehold(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db, Config{AdminPassword: "secret"})
	adminToken := loginAdmin(t, server)
	householdID, _, inviteCode := createHouseholdInvite(t, server, adminToken, "Home")
	otherHouseholdID, _, _ := createHouseholdInvite(t, server, adminToken, "Other Home")
	joinPayload := joinDevice(t, server, inviteCode, "小王")

	for _, route := range []struct {
		method string
		path   string
		body   string
	}{
		{http.MethodGet, "/api/households/" + strconv.FormatInt(householdID, 10) + "/members", ""},
		{http.MethodGet, "/api/households/" + strconv.FormatInt(householdID, 10) + "/expenses", ""},
		{http.MethodPost, "/api/households/" + strconv.FormatInt(householdID, 10) + "/expenses", `{"memberId":1,"categoryId":1,"amountCents":100,"spentAt":"2026-06-16T12:00:00Z"}`},
	} {
		request := httptest.NewRequest(route.method, route.path, strings.NewReader(route.body))
		if route.body != "" {
			request.Header.Set("Content-Type", "application/json")
		}
		response := httptest.NewRecorder()
		server.Handler().ServeHTTP(response, request)
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("%s %s missing bearer expected 401, got %d: %s", route.method, route.path, response.Code, response.Body.String())
		}

		wrongHouseholdPath := strings.Replace(route.path, strconv.FormatInt(householdID, 10), strconv.FormatInt(otherHouseholdID, 10), 1)
		wrongHouseholdRequest := httptest.NewRequest(route.method, wrongHouseholdPath, strings.NewReader(route.body))
		wrongHouseholdRequest.Header.Set("Authorization", "Bearer "+joinPayload.Token)
		if route.body != "" {
			wrongHouseholdRequest.Header.Set("Content-Type", "application/json")
		}
		wrongHouseholdResponse := httptest.NewRecorder()
		server.Handler().ServeHTTP(wrongHouseholdResponse, wrongHouseholdRequest)
		if wrongHouseholdResponse.Code != http.StatusForbidden {
			t.Fatalf("%s %s wrong household expected 403, got %d: %s", route.method, wrongHouseholdPath, wrongHouseholdResponse.Code, wrongHouseholdResponse.Body.String())
		}
	}

	membersResponse := memberGET(server, "/api/households/"+strconv.FormatInt(householdID, 10)+"/members", joinPayload.Token)
	if membersResponse.Code != http.StatusOK {
		t.Fatalf("matching household members expected 200, got %d: %s", membersResponse.Code, membersResponse.Body.String())
	}
}

func TestInviteUsageCountIncrementsOnlyOnSuccessfulJoins(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "api.db")
	db, err := store.Open(dbPath)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db, Config{AdminPassword: "secret"})
	adminToken := loginAdmin(t, server)
	_, inviteID, inviteCode := createHouseholdInvite(t, server, adminToken, "Home")
	rawDB, err := sql.Open("sqlite", dbPath)
	if err != nil {
		t.Fatalf("open raw sqlite db: %v", err)
	}
	defer rawDB.Close()

	badNicknameResponse := postJoin(server, inviteCode, "   ")
	if badNicknameResponse.Code != http.StatusBadRequest {
		t.Fatalf("blank nickname expected 400, got %d: %s", badNicknameResponse.Code, badNicknameResponse.Body.String())
	}
	if usageCount(t, rawDB, inviteID) != 0 {
		t.Fatalf("blank nickname should not increment usage_count")
	}

	invalidInviteResponse := postJoin(server, "invalid", "小王")
	if invalidInviteResponse.Code != http.StatusUnauthorized {
		t.Fatalf("invalid invite expected 401, got %d: %s", invalidInviteResponse.Code, invalidInviteResponse.Body.String())
	}
	if usageCount(t, rawDB, inviteID) != 0 {
		t.Fatalf("invalid invite should not increment usage_count")
	}

	successResponse := postJoin(server, inviteCode, "小王")
	if successResponse.Code != http.StatusOK {
		t.Fatalf("successful join expected 200, got %d: %s", successResponse.Code, successResponse.Body.String())
	}
	if usageCount(t, rawDB, inviteID) != 1 {
		t.Fatalf("successful join should increment usage_count to 1")
	}

	if _, err := rawDB.ExecContext(context.Background(), "UPDATE invite_codes SET status = 'disabled' WHERE id = ?", inviteID); err != nil {
		t.Fatalf("disable invite code: %v", err)
	}
	disabledResponse := postJoin(server, inviteCode, "小李")
	if disabledResponse.Code != http.StatusUnauthorized {
		t.Fatalf("disabled invite expected 401, got %d: %s", disabledResponse.Code, disabledResponse.Body.String())
	}
	if usageCount(t, rawDB, inviteID) != 1 {
		t.Fatalf("disabled invite should not increment usage_count")
	}
}

func TestAdminMissingHouseholdCategoriesReturnsNotFound(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db, Config{AdminPassword: "secret"})
	token := loginAdmin(t, server)

	response := adminJSONRequest(t, server, token, http.MethodGet, "/admin/households/999/categories", "")
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected missing household categories 404, got %d: %s", response.Code, response.Body.String())
	}
}

func TestAdminMissingHouseholdMembersReturnsNotFound(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db, Config{AdminPassword: "secret"})
	token := loginAdmin(t, server)

	response := adminJSONRequest(t, server, token, http.MethodGet, "/admin/households/999/members", "")
	if response.Code != http.StatusNotFound {
		t.Fatalf("expected missing household members 404, got %d: %s", response.Code, response.Body.String())
	}
}

func TestPublicMissingHouseholdMembersRequiresBearerToken(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db)
	request := httptest.NewRequest(http.MethodGet, "/api/households/999/members", nil)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected missing bearer 401, got %d: %s", response.Code, response.Body.String())
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

	lockedCorrectPasswordResponse := postAdminLogin(server, "secret")
	if lockedCorrectPasswordResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected correct password during lockout to return 429, got %d: %s", lockedCorrectPasswordResponse.Code, lockedCorrectPasswordResponse.Body.String())
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

func TestAdminLoginLockoutExpires(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db, Config{
		AdminPassword:             "secret",
		AdminLoginLockoutDuration: time.Millisecond,
	})

	for attempt := 1; attempt <= adminLoginFailureLimit; attempt++ {
		response := postAdminLogin(server, "wrong")
		if response.Code != http.StatusUnauthorized {
			t.Fatalf("attempt %d expected 401, got %d: %s", attempt, response.Code, response.Body.String())
		}
	}

	lockedResponse := postAdminLogin(server, "wrong")
	if lockedResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected 429 during lockout, got %d: %s", lockedResponse.Code, lockedResponse.Body.String())
	}

	lockedCorrectPasswordResponse := postAdminLogin(server, "secret")
	if lockedCorrectPasswordResponse.Code != http.StatusTooManyRequests {
		t.Fatalf("expected correct password during lockout to return 429, got %d: %s", lockedCorrectPasswordResponse.Code, lockedCorrectPasswordResponse.Body.String())
	}

	time.Sleep(2 * time.Millisecond)

	expiredResponse := postAdminLogin(server, "secret")
	if expiredResponse.Code != http.StatusOK {
		t.Fatalf("expected login 200 after lockout expiration, got %d: %s", expiredResponse.Code, expiredResponse.Body.String())
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

func loginAdmin(t *testing.T, server *Server) string {
	t.Helper()

	loginResponse := postAdminLogin(server, "secret")
	if loginResponse.Code != http.StatusOK {
		t.Fatalf("expected login 200, got %d: %s", loginResponse.Code, loginResponse.Body.String())
	}

	var loginPayload struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	decodeJSON(t, loginResponse, &loginPayload)
	if loginPayload.Data.Token == "" {
		t.Fatal("expected non-empty admin token")
	}

	return loginPayload.Data.Token
}

func adminJSONRequest(t *testing.T, server *Server, token, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()

	var reader *strings.Reader
	if body == "" {
		reader = strings.NewReader("")
	} else {
		reader = strings.NewReader(body)
	}
	request := httptest.NewRequest(method, path, reader)
	request.Header.Set("Authorization", "Bearer "+token)
	if body != "" {
		request.Header.Set("Content-Type", "application/json")
	}
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	return response
}

func createHouseholdInvite(t *testing.T, server *Server, adminToken, householdName string) (int64, int64, string) {
	t.Helper()

	createHouseholdResponse := adminJSONRequest(t, server, adminToken, http.MethodPost, "/admin/households", `{"name":"`+householdName+`"}`)
	if createHouseholdResponse.Code != http.StatusCreated {
		t.Fatalf("expected create household 201, got %d: %s", createHouseholdResponse.Code, createHouseholdResponse.Body.String())
	}
	var createHouseholdPayload struct {
		Data struct {
			ID int64 `json:"id"`
		} `json:"data"`
	}
	decodeJSON(t, createHouseholdResponse, &createHouseholdPayload)
	if createHouseholdPayload.Data.ID == 0 {
		t.Fatalf("expected household id, got %#v", createHouseholdPayload.Data)
	}

	createInviteCodeResponse := adminJSONRequest(t, server, adminToken, http.MethodPost, "/admin/households/"+strconv.FormatInt(createHouseholdPayload.Data.ID, 10)+"/invite-codes", `{}`)
	if createInviteCodeResponse.Code != http.StatusCreated {
		t.Fatalf("expected create invite code 201, got %d: %s", createInviteCodeResponse.Code, createInviteCodeResponse.Body.String())
	}
	var createInviteCodePayload struct {
		Data struct {
			ID   int64  `json:"id"`
			Code string `json:"code"`
		} `json:"data"`
	}
	decodeJSON(t, createInviteCodeResponse, &createInviteCodePayload)
	if createInviteCodePayload.Data.ID == 0 || createInviteCodePayload.Data.Code == "" {
		t.Fatalf("unexpected invite code response: %#v", createInviteCodePayload.Data)
	}

	return createHouseholdPayload.Data.ID, createInviteCodePayload.Data.ID, createInviteCodePayload.Data.Code
}

type joinedDevice struct {
	HouseholdID int64
	MemberID    int64
	Token       string
}

func joinDevice(t *testing.T, server *Server, inviteCode, nickname string) joinedDevice {
	t.Helper()

	response := postJoin(server, inviteCode, nickname)
	if response.Code != http.StatusOK {
		t.Fatalf("expected join 200, got %d: %s", response.Code, response.Body.String())
	}
	var payload struct {
		Data struct {
			Household struct {
				ID int64 `json:"id"`
			} `json:"household"`
			Member struct {
				ID          int64 `json:"id"`
				HouseholdID int64 `json:"householdId"`
			} `json:"member"`
			Token string `json:"token"`
		} `json:"data"`
	}
	decodeJSON(t, response, &payload)
	if payload.Data.Household.ID == 0 || payload.Data.Member.ID == 0 || payload.Data.Member.HouseholdID != payload.Data.Household.ID || payload.Data.Token == "" {
		t.Fatalf("unexpected join payload: %#v", payload.Data)
	}

	return joinedDevice{
		HouseholdID: payload.Data.Household.ID,
		MemberID:    payload.Data.Member.ID,
		Token:       payload.Data.Token,
	}
}

func postJoin(server *Server, inviteCode, nickname string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodPost, "/api/join", strings.NewReader(`{"inviteCode":"`+inviteCode+`","nickname":"`+nickname+`"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	return response
}

func memberGET(server *Server, path, token string) *httptest.ResponseRecorder {
	request := httptest.NewRequest(http.MethodGet, path, nil)
	request.Header.Set("Authorization", "Bearer "+token)
	response := httptest.NewRecorder()

	server.Handler().ServeHTTP(response, request)

	return response
}

func usageCount(t *testing.T, db *sql.DB, inviteID int64) int {
	t.Helper()

	var count int
	if err := db.QueryRowContext(context.Background(), "SELECT usage_count FROM invite_codes WHERE id = ?", inviteID).Scan(&count); err != nil {
		t.Fatalf("read usage_count: %v", err)
	}
	return count
}

func decodeJSON(t *testing.T, response *httptest.ResponseRecorder, target any) {
	t.Helper()

	if err := json.NewDecoder(response.Body).Decode(target); err != nil {
		t.Fatalf("decode response: %v; body=%s", err, response.Body.String())
	}
}
