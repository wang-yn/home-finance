# Home Finance MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first collaborative self-hosted household expense MVP with device-side joining/expense tracking and a lightweight admin console.

**Architecture:** The Go API owns all authoritative data in SQLite, exposes separate device (`/api`) and admin (`/admin`) surfaces, and keeps auth simple with invite codes, member session tokens, and admin tokens. The React/Tauri client becomes a route-based single-page app with separate device and admin views sharing a small API client and local session storage.

**Tech Stack:** Go 1.26, Gin, modernc SQLite, React 19, TypeScript, Vite, Tauri 2.

---

## File Structure

### Backend

- `services/api/internal/domain/models.go`
  - Owns request/response/domain structs used by HTTP handlers and store methods.
- `services/api/internal/store/schema.go`
  - Owns SQLite schema and default category seed statements.
- `services/api/internal/store/store.go`
  - Owns database open, migrations, transactions, and small shared helpers.
- `services/api/internal/store/admin.go`
  - Create for admin login, status, household, invite, member, category, and export queries.
- `services/api/internal/store/device.go`
  - Create for join, session lookup, expenses, categories, analytics.
- `services/api/internal/store/store_test.go`
  - Create for store-level behavior tests using `:memory:`.
- `services/api/internal/httpapi/server.go`
  - Keep server construction and route registration only.
- `services/api/internal/httpapi/admin_handlers.go`
  - Create for `/admin/*` handlers and admin middleware.
- `services/api/internal/httpapi/device_handlers.go`
  - Create for `/api/*` handlers and device middleware.
- `services/api/internal/httpapi/server_test.go`
  - Expand handler tests for auth, join, expenses, analytics, and admin flows.
- `services/api/cmd/server/main.go`
  - Read env config such as `HOME_FINANCE_DB_PATH` and `HOME_FINANCE_ADMIN_PASSWORD`.

### Frontend

- `apps/desktop/src/App.tsx`
  - Replace static mock dashboard with shell routing between device and admin modes.
- `apps/desktop/src/App.css`
  - Replace static dashboard CSS with responsive app, device, and admin layouts.
- `apps/desktop/src/api/client.ts`
  - Create typed fetch wrapper for device/admin APIs and common error handling.
- `apps/desktop/src/api/types.ts`
  - Create TypeScript DTOs matching backend responses.
- `apps/desktop/src/storage/session.ts`
  - Create localStorage wrapper for service URL, member token, and admin token.
- `apps/desktop/src/utils/format.ts`
  - Create money/date/month formatting helpers.
- `apps/desktop/src/utils/format.test.ts`
  - Create focused unit tests for formatting helpers.
- `apps/desktop/src/components/DeviceApp.tsx`
  - Create device-side route/view state container.
- `apps/desktop/src/components/AdminApp.tsx`
  - Create admin-side route/view state container.
- `apps/desktop/src/components/forms.tsx`
  - Create small shared form field primitives if repeated form markup becomes noisy.
- `apps/desktop/src/test/setup.ts`
  - Create Vitest setup if frontend tests are added.
- `apps/desktop/package.json`
  - Add `test` script and testing dev dependencies when frontend tests are introduced.

### Docs

- `README.md`
  - Update setup, admin password, API URL, and validation commands after implementation.
- `docs/superpowers/specs/2026-06-16-home-finance-feature-design.md`
  - Do not modify unless requirements change.

---

## Task 1: Backend Schema and Domain Foundation

**Files:**
- Modify: `services/api/internal/domain/models.go`
- Modify: `services/api/internal/store/schema.go`
- Modify: `services/api/internal/store/store.go`
- Create: `services/api/internal/store/store_test.go`

- [ ] **Step 1: Write failing schema migration test**

Add `services/api/internal/store/store_test.go`:

```go
package store

import (
	"context"
	"testing"
)

func TestOpenCreatesMVPDatabaseSchema(t *testing.T) {
	db, err := Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	tables := []string{
		"households",
		"members",
		"invite_codes",
		"categories",
		"expenses",
		"admin_sessions",
	}

	for _, table := range tables {
		var name string
		err := db.db.QueryRowContext(
			context.Background(),
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
			table,
		).Scan(&name)
		if err != nil {
			t.Fatalf("expected table %s to exist: %v", table, err)
		}
	}
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/api
go test ./internal/store -run TestOpenCreatesMVPDatabaseSchema -count=1
```

Expected: FAIL because `invite_codes` and `admin_sessions` do not exist yet.

- [ ] **Step 3: Update schema**

Replace `services/api/internal/store/schema.go` with schema that includes:

```go
package store

const schema = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS households (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	name TEXT NOT NULL,
	status TEXT NOT NULL DEFAULT 'active',
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS members (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	household_id INTEGER NOT NULL,
	nickname TEXT NOT NULL,
	session_token_hash TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'active',
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	last_active_at TIMESTAMP,
	FOREIGN KEY (household_id) REFERENCES households(id)
);

CREATE TABLE IF NOT EXISTS invite_codes (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	household_id INTEGER NOT NULL,
	code_hash TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'active',
	expires_at TIMESTAMP,
	usage_count INTEGER NOT NULL DEFAULT 0,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (household_id) REFERENCES households(id)
);

CREATE TABLE IF NOT EXISTS categories (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	household_id INTEGER NOT NULL,
	name TEXT NOT NULL,
	color TEXT NOT NULL DEFAULT '#64748b',
	sort_order INTEGER NOT NULL DEFAULT 0,
	status TEXT NOT NULL DEFAULT 'active',
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (household_id) REFERENCES households(id)
);

CREATE TABLE IF NOT EXISTS expenses (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	household_id INTEGER NOT NULL,
	member_id INTEGER NOT NULL,
	category_id INTEGER NOT NULL,
	amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
	currency TEXT NOT NULL DEFAULT 'CNY',
	note TEXT NOT NULL DEFAULT '',
	spent_at TIMESTAMP NOT NULL,
	deleted_at TIMESTAMP,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	FOREIGN KEY (household_id) REFERENCES households(id),
	FOREIGN KEY (member_id) REFERENCES members(id),
	FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS admin_sessions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	token_hash TEXT NOT NULL UNIQUE,
	expires_at TIMESTAMP NOT NULL,
	created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_expenses_household_spent_at ON expenses(household_id, spent_at DESC);
CREATE INDEX IF NOT EXISTS idx_expenses_household_category ON expenses(household_id, category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_household_member ON expenses(household_id, member_id);
CREATE INDEX IF NOT EXISTS idx_members_household_nickname ON members(household_id, nickname);
CREATE INDEX IF NOT EXISTS idx_categories_household_sort ON categories(household_id, sort_order, name);
`
```

- [ ] **Step 4: Update domain structs**

Update `services/api/internal/domain/models.go` to include `Household`, `InviteCode`, `Category`, `AdminStatus`, `AnalyticsSummary`, request structs, and rename member `Name` to `Nickname`. Keep JSON fields camelCase.

- [ ] **Step 5: Run store tests**

Run:

```bash
cd services/api
go test ./internal/store -count=1
```

Expected: PASS.

- [ ] **Step 6: Run all backend tests**

Run:

```bash
cd services/api
go test ./...
```

Expected: existing handler tests may fail because they still reference `members.name`; fix only compilation breaks by updating scans to `nickname`.

- [ ] **Step 7: Commit**

```bash
git add services/api/internal/domain/models.go services/api/internal/store/schema.go services/api/internal/store/store.go services/api/internal/store/store_test.go
git commit -m "feat(api): 建立协作记账数据模型"
```

---

## Task 2: Admin Auth and Status API

**Files:**
- Create: `services/api/internal/store/admin.go`
- Modify: `services/api/internal/httpapi/server.go`
- Create: `services/api/internal/httpapi/admin_handlers.go`
- Modify: `services/api/internal/httpapi/server_test.go`
- Modify: `services/api/cmd/server/main.go`

- [ ] **Step 1: Write failing admin login/status tests**

Add tests to `services/api/internal/httpapi/server_test.go`:

```go
func TestAdminLoginAndStatus(t *testing.T) {
	db, err := store.Open(":memory:")
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	defer db.Close()

	server := NewServer(db, Config{AdminPassword: "secret"})

	loginBody := strings.NewReader(`{"password":"secret"}`)
	loginReq := httptest.NewRequest(http.MethodPost, "/admin/login", loginBody)
	loginReq.Header.Set("Content-Type", "application/json")
	loginRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(loginRes, loginReq)

	if loginRes.Code != http.StatusOK {
		t.Fatalf("expected login 200, got %d: %s", loginRes.Code, loginRes.Body.String())
	}

	var loginPayload struct {
		Data struct {
			Token string `json:"token"`
		} `json:"data"`
	}
	if err := json.Unmarshal(loginRes.Body.Bytes(), &loginPayload); err != nil {
		t.Fatalf("decode login response: %v", err)
	}
	if loginPayload.Data.Token == "" {
		t.Fatal("expected admin token")
	}

	statusReq := httptest.NewRequest(http.MethodGet, "/admin/status", nil)
	statusReq.Header.Set("Authorization", "Bearer "+loginPayload.Data.Token)
	statusRes := httptest.NewRecorder()
	server.Handler().ServeHTTP(statusRes, statusReq)

	if statusRes.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d: %s", statusRes.Code, statusRes.Body.String())
	}
}
```

Update imports to include `encoding/json` and `strings`.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/api
go test ./internal/httpapi -run TestAdminLoginAndStatus -count=1
```

Expected: FAIL because `NewServer` has no config and `/admin/login` does not exist.

- [ ] **Step 3: Add HTTP config and route grouping**

In `services/api/internal/httpapi/server.go`, add:

```go
type Config struct {
	AdminPassword string
}

type Server struct {
	router *gin.Engine
	store  *store.Store
	config Config
}

func NewServer(store *store.Store, config ...Config) *Server {
	cfg := Config{}
	if len(config) > 0 {
		cfg = config[0]
	}
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Logger(), gin.Recovery())

	server := &Server{router: router, store: store, config: cfg}
	server.routes()
	return server
}
```

- [ ] **Step 4: Implement token helpers in store**

Create `services/api/internal/store/admin.go` with methods:

```go
func HashSecret(secret string) string
func GenerateToken() (string, error)
func (s *Store) CreateAdminSession(ctx context.Context, token string, ttl time.Duration) error
func (s *Store) ValidateAdminSession(ctx context.Context, token string) (bool, error)
func (s *Store) AdminStatus(ctx context.Context, dbPath string) (domain.AdminStatus, error)
```

Use `crypto/rand` for tokens and SHA-256 hex for hashes. `AdminStatus` should count households, members, and non-deleted expenses.

- [ ] **Step 5: Implement admin handlers**

Create `services/api/internal/httpapi/admin_handlers.go` with:

- `adminLogin`
- `adminStatus`
- `requireAdmin`
- `bearerToken`

Rules:

- Empty `Config.AdminPassword` returns `500` on login with `"admin password is not configured"`.
- Wrong password returns `401`.
- Valid login creates a 24-hour token and returns `{"data":{"token":"..."}}`.
- Missing/invalid admin token returns `401`.

- [ ] **Step 6: Wire routes**

In `routes()`:

```go
s.router.POST("/admin/login", s.adminLogin)
admin := s.router.Group("/admin", s.requireAdmin())
admin.GET("/status", s.adminStatus)
```

- [ ] **Step 7: Update main config**

In `services/api/cmd/server/main.go`, pass:

```go
server := httpapi.NewServer(db, httpapi.Config{
	AdminPassword: os.Getenv("HOME_FINANCE_ADMIN_PASSWORD"),
})
```

- [ ] **Step 8: Run focused and full backend tests**

Run:

```bash
cd services/api
go test ./internal/httpapi -run TestAdminLoginAndStatus -count=1
go test ./...
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add services/api/cmd/server/main.go services/api/internal/httpapi/server.go services/api/internal/httpapi/admin_handlers.go services/api/internal/httpapi/server_test.go services/api/internal/store/admin.go
git commit -m "feat(api): 增加管理后台登录和状态接口"
```

---

## Task 3: Households, Invite Codes, Members, and Categories Admin API

**Files:**
- Modify: `services/api/internal/store/admin.go`
- Modify: `services/api/internal/httpapi/admin_handlers.go`
- Modify: `services/api/internal/httpapi/server.go`
- Modify: `services/api/internal/httpapi/server_test.go`

- [ ] **Step 1: Write failing admin household flow test**

Add `TestAdminCanManageHouseholdInviteMemberAndCategory` to `server_test.go`. It should:

1. Login as admin.
2. `POST /admin/households` with `{"name":"Home"}` and expect household ID.
3. `POST /admin/households/:id/invite-codes` and expect plaintext `code`.
4. `GET /admin/households` and expect one household.
5. `POST /admin/households/:id/categories` with `{"name":"Coffee","color":"#7c2d12","sortOrder":10}`.
6. `GET /admin/households/:id/categories` and expect default categories plus Coffee.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/api
go test ./internal/httpapi -run TestAdminCanManageHouseholdInviteMemberAndCategory -count=1
```

Expected: FAIL with missing routes.

- [ ] **Step 3: Implement store methods**

In `admin.go`, add:

- `CreateHousehold(ctx, name) (domain.Household, error)`
- `ListHouseholds(ctx) ([]domain.Household, error)`
- `UpdateHousehold(ctx, id, name) (domain.Household, error)`
- `CreateInviteCode(ctx, householdID, ttl) (domain.InviteCodeWithPlaintext, error)`
- `DisableInviteCode(ctx, id) error`
- `ListMembers(ctx, householdID) ([]domain.Member, error)`
- `UpdateMember(ctx, id, nickname, status) (domain.Member, error)`
- `ListCategories(ctx, householdID) ([]domain.Category, error)`
- `CreateCategory(ctx, householdID, input) (domain.Category, error)`
- `UpdateCategory(ctx, id, input) (domain.Category, error)`

When creating a household, seed default categories in the same transaction.

- [ ] **Step 4: Implement admin handlers**

Add handlers for:

- `GET /admin/households`
- `POST /admin/households`
- `PATCH /admin/households/:id`
- `POST /admin/households/:id/invite-codes`
- `PATCH /admin/invite-codes/:id`
- `GET /admin/households/:id/members`
- `PATCH /admin/members/:id`
- `GET /admin/households/:id/categories`
- `POST /admin/households/:id/categories`
- `PATCH /admin/categories/:id`

Use `400` for invalid payloads and `404` for missing IDs.

- [ ] **Step 5: Wire admin routes**

Register the routes under the existing admin group in `server.go`.

- [ ] **Step 6: Run focused and full backend tests**

Run:

```bash
cd services/api
go test ./internal/httpapi -run TestAdminCanManageHouseholdInviteMemberAndCategory -count=1
go test ./...
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/api/internal/httpapi/admin_handlers.go services/api/internal/httpapi/server.go services/api/internal/httpapi/server_test.go services/api/internal/store/admin.go services/api/internal/domain/models.go
git commit -m "feat(api): 增加家庭邀请码成员和分类管理"
```

---

## Task 4: Device Join and Session API

**Files:**
- Create: `services/api/internal/store/device.go`
- Create or modify: `services/api/internal/httpapi/device_handlers.go`
- Modify: `services/api/internal/httpapi/server.go`
- Modify: `services/api/internal/httpapi/server_test.go`

- [ ] **Step 1: Write failing join test**

Add `TestDeviceCanJoinHouseholdWithInviteCode`:

1. Use admin helper to create household and invite code.
2. `POST /api/join` with `{"inviteCode":"...","nickname":"小王"}`.
3. Expect household, member, and token.
4. `GET /api/me` with bearer token.
5. Expect same member nickname and household ID.

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd services/api
go test ./internal/httpapi -run TestDeviceCanJoinHouseholdWithInviteCode -count=1
```

Expected: FAIL because `/api/join` does not exist.

- [ ] **Step 3: Implement store device join/session methods**

Create `device.go`:

- `JoinHousehold(ctx, inviteCode, nickname) (domain.JoinResult, error)`
- `MemberBySessionToken(ctx, token) (domain.MemberSession, error)`

Rules:

- Invite code hash must match active invite.
- Expired invite is invalid.
- Nickname is trimmed and required.
- Generate member session token with `GenerateToken`.
- Store only token hash.
- Increment invite `usage_count`.
- Update `last_active_at` on successful `/api/me`.

- [ ] **Step 4: Implement device middleware and handlers**

Create `device_handlers.go`:

- `join`
- `me`
- `requireMember`

The middleware should attach `domain.MemberSession` to Gin context.

- [ ] **Step 5: Replace old household URL routes**

Remove or keep compatibility routes only if tests need them. Preferred MVP routes:

```go
s.router.POST("/api/join", s.join)
api := s.router.Group("/api", s.requireMember())
api.GET("/me", s.me)
```

- [ ] **Step 6: Run tests**

Run:

```bash
cd services/api
go test ./internal/httpapi -run TestDeviceCanJoinHouseholdWithInviteCode -count=1
go test ./...
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add services/api/internal/store/device.go services/api/internal/httpapi/device_handlers.go services/api/internal/httpapi/server.go services/api/internal/httpapi/server_test.go services/api/internal/domain/models.go
git commit -m "feat(api): 增加邀请码加入家庭流程"
```

---

## Task 5: Device Expense CRUD, Categories, Analytics, and CSV Export

**Files:**
- Modify: `services/api/internal/store/device.go`
- Modify: `services/api/internal/store/admin.go`
- Modify: `services/api/internal/httpapi/device_handlers.go`
- Modify: `services/api/internal/httpapi/admin_handlers.go`
- Modify: `services/api/internal/httpapi/server.go`
- Modify: `services/api/internal/httpapi/server_test.go`

- [ ] **Step 1: Write failing expense and analytics test**

Add `TestDeviceExpenseCRUDAndMonthlyAnalytics`:

1. Create household, invite, join member.
2. Fetch categories.
3. Create expense with amount `12345`.
4. List expenses for month and expect one.
5. Patch amount to `20000`.
6. Fetch analytics and expect monthly total `20000`.
7. Delete expense.
8. List expenses and expect zero.

- [ ] **Step 2: Write failing CSV export test**

Add `TestAdminCanExportExpensesCSV`:

1. Create household, invite, join member, create expense.
2. Login admin.
3. `GET /admin/exports/expenses.csv?householdId=<id>&month=YYYY-MM`.
4. Expect `text/csv` content type and header `spent_at,member,category,amount,currency,note`.

- [ ] **Step 3: Run tests to verify they fail**

Run:

```bash
cd services/api
go test ./internal/httpapi -run 'TestDeviceExpenseCRUDAndMonthlyAnalytics|TestAdminCanExportExpensesCSV' -count=1
```

Expected: FAIL because expense, analytics, category, and export routes are incomplete.

- [ ] **Step 4: Implement device store methods**

In `device.go`, add:

- `ListActiveCategories(ctx, householdID)`
- `CreateExpense(ctx, session, input)`
- `UpdateExpense(ctx, session, expenseID, input)`
- `DeleteExpense(ctx, session, expenseID)`
- `ListExpenses(ctx, session, filter)`
- `MonthlyAnalytics(ctx, session, month)`

Rules:

- Expenses are scoped to the member session household.
- Deleted expenses use `deleted_at`.
- Queries exclude deleted expenses.
- Category must be active for create/update.
- Month filter uses inclusive start and exclusive next-month boundary.

- [ ] **Step 5: Implement handlers and routes**

Add device routes:

```go
api.GET("/categories", s.listCategories)
api.GET("/expenses", s.listExpenses)
api.POST("/expenses", s.createExpense)
api.PATCH("/expenses/:id", s.updateExpense)
api.DELETE("/expenses/:id", s.deleteExpense)
api.GET("/analytics/monthly", s.monthlyAnalytics)
```

Add admin export route:

```go
admin.GET("/exports/expenses.csv", s.exportExpensesCSV)
```

- [ ] **Step 6: Implement CSV export**

In `admin.go`, add `ExportExpensesCSVRows(ctx, householdID, month)` and in handler write:

```text
spent_at,member,category,amount,currency,note
```

Format amount as decimal yuan using integer cents, for example `123.45`.

- [ ] **Step 7: Run backend tests**

Run:

```bash
cd services/api
go test ./...
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add services/api/internal/store/device.go services/api/internal/store/admin.go services/api/internal/httpapi/device_handlers.go services/api/internal/httpapi/admin_handlers.go services/api/internal/httpapi/server.go services/api/internal/httpapi/server_test.go services/api/internal/domain/models.go
git commit -m "feat(api): 增加支出记录分析和导出"
```

---

## Task 6: Frontend Test Harness and Shared Client Utilities

**Files:**
- Modify: `apps/desktop/package.json`
- Modify: `apps/desktop/package-lock.json`
- Create: `apps/desktop/src/api/types.ts`
- Create: `apps/desktop/src/api/client.ts`
- Create: `apps/desktop/src/storage/session.ts`
- Create: `apps/desktop/src/utils/format.ts`
- Create: `apps/desktop/src/utils/format.test.ts`

- [ ] **Step 1: Add frontend test dependencies**

Run:

```bash
cd apps/desktop
npm install -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Expected: package files update.

- [ ] **Step 2: Add test script**

In `apps/desktop/package.json`:

```json
"test": "vitest run"
```

- [ ] **Step 3: Write failing format tests**

Create `apps/desktop/src/utils/format.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { formatCents, formatMonth } from './format'

describe('formatCents', () => {
  it('formats integer cents as CNY amount', () => {
    expect(formatCents(12345, 'CNY')).toBe('¥123.45')
  })
})

describe('formatMonth', () => {
  it('formats date as YYYY-MM', () => {
    expect(formatMonth(new Date('2026-06-16T00:00:00Z'))).toBe('2026-06')
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run:

```bash
cd apps/desktop
npm run test -- src/utils/format.test.ts
```

Expected: FAIL because `format.ts` does not exist.

- [ ] **Step 5: Implement format helpers**

Create `apps/desktop/src/utils/format.ts`:

```ts
export function formatCents(amountCents: number, currency = 'CNY') {
  const amount = amountCents / 100
  if (currency === 'CNY') {
    return `¥${amount.toFixed(2)}`
  }
  return `${currency} ${amount.toFixed(2)}`
}

export function formatMonth(date: Date) {
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  return `${year}-${month}`
}
```

- [ ] **Step 6: Add API DTOs and client**

Create `types.ts` for Household, Member, Category, Expense, AnalyticsSummary, AdminStatus.

Create `client.ts` with:

- `ApiError`
- `request<T>(baseUrl, path, options)`
- `health(baseUrl)`
- `adminLogin(baseUrl, password)`
- `joinHousehold(baseUrl, inviteCode, nickname)`

- [ ] **Step 7: Add session storage wrapper**

Create `session.ts` with:

- `loadServiceUrl`
- `saveServiceUrl`
- `loadMemberToken`
- `saveMemberToken`
- `clearMemberToken`
- `loadAdminToken`
- `saveAdminToken`
- `clearAdminToken`

Use explicit localStorage keys prefixed by `homeFinance.`.

- [ ] **Step 8: Run frontend tests, lint, build**

Run:

```bash
cd apps/desktop
npm run test
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/desktop/package.json apps/desktop/package-lock.json apps/desktop/src/api apps/desktop/src/storage apps/desktop/src/utils
git commit -m "test(前端): 增加客户端工具测试基础"
```

---

## Task 7: Device-Side Frontend Flow

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.css`
- Modify: `apps/desktop/src/api/client.ts`
- Create: `apps/desktop/src/components/DeviceApp.tsx`

- [ ] **Step 1: Extend API client**

Add device client methods:

- `getMe`
- `getCategories`
- `getExpenses`
- `createExpense`
- `updateExpense`
- `deleteExpense`
- `getMonthlyAnalytics`

- [ ] **Step 2: Create DeviceApp component**

Create `DeviceApp.tsx` with view state:

- `connect`
- `join`
- `overview`
- `expenses`
- `analysis`
- `settings`

Implement:

- Service URL form calling `health`.
- Join form calling `joinHousehold`.
- Overview calling `getMonthlyAnalytics`.
- Expense list calling `getExpenses`.
- Expense form for create/update.
- Settings for service URL and logout.

- [ ] **Step 3: Replace App shell**

Update `App.tsx`:

```tsx
import './App.css'
import { DeviceApp } from './components/DeviceApp'

function App() {
  return <DeviceApp />
}

export default App
```

- [ ] **Step 4: Update CSS**

Update `App.css` to support:

- `.app-shell`
- `.mobile-nav`
- `.topbar`
- `.panel`
- `.form-grid`
- `.error`
- `.empty-state`
- `.metric-grid`
- `.admin-layout` for future admin work

Keep cards at `8px` radius or less.

- [ ] **Step 5: Run frontend verification**

Run:

```bash
cd apps/desktop
npm run test
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/App.tsx apps/desktop/src/App.css apps/desktop/src/api/client.ts apps/desktop/src/components/DeviceApp.tsx
git commit -m "feat(设备端): 增加连接加入和支出页面"
```

---

## Task 8: Admin Frontend Flow

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/App.css`
- Modify: `apps/desktop/src/api/client.ts`
- Create: `apps/desktop/src/components/AdminApp.tsx`

- [ ] **Step 1: Extend API client with admin methods**

Add:

- `getAdminStatus`
- `listHouseholds`
- `createHousehold`
- `updateHousehold`
- `createInviteCode`
- `disableInviteCode`
- `listMembers`
- `updateMember`
- `listAdminCategories`
- `createAdminCategory`
- `updateAdminCategory`
- `exportExpensesCsvUrl`

- [ ] **Step 2: Add mode switch in App**

Update `App.tsx` to let user switch between:

- `Device`
- `Admin`

Keep default as Device.

- [ ] **Step 3: Create AdminApp component**

Implement views:

- Login
- Status
- Households
- Invite codes
- Members
- Categories
- Export

Use service URL from shared session storage. Admin login saves admin token separately from member token.

- [ ] **Step 4: Update CSS for admin layout**

Use sidebar navigation on wider screens and stacked navigation on mobile.

- [ ] **Step 5: Run frontend verification**

Run:

```bash
cd apps/desktop
npm run test
npm run lint
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/src/App.tsx apps/desktop/src/App.css apps/desktop/src/api/client.ts apps/desktop/src/components/AdminApp.tsx
git commit -m "feat(后台): 增加轻量管理后台页面"
```

---

## Task 9: Documentation and End-to-End Smoke Verification

**Files:**
- Modify: `README.md`
- Modify: `docs/architecture.md`
- Modify: `AGENTS.md` if validation commands changed

- [ ] **Step 1: Update README**

Document:

- `HOME_FINANCE_DB_PATH`
- `HOME_FINANCE_ADMIN_PASSWORD`
- API startup command
- Frontend startup command
- How to create household and invite code
- How to join from device side
- Verification commands

- [ ] **Step 2: Update architecture doc**

Add a short section for:

- self-hosted API
- device token auth
- admin token auth
- SQLite as source of truth

- [ ] **Step 3: Run full verification**

Run:

```bash
cd services/api
go test ./...
```

Expected: PASS.

Run:

```bash
cd apps/desktop
npm run test
npm run lint
npm run build
```

Expected: PASS.

Run:

```bash
cd apps/desktop/src-tauri
cargo check
```

Expected: PASS if system dependencies are installed. If it fails with missing `dbus-1`, record this exact environment gap in the final report instead of claiming Tauri verification passed.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/architecture.md AGENTS.md
git commit -m "docs(使用): 更新自托管部署和验证说明"
```

---

## Self-Review

Spec coverage:

- Device service connection: Task 6 client utilities and Task 7 DeviceApp.
- Invite join and member session: Task 4 backend and Task 7 frontend.
- Full household visibility: Task 4 session scoping and Task 5 expense listing scoped by household.
- Expense CRUD: Task 5 backend and Task 7 frontend.
- Categories: Task 3 admin management, Task 5 device listing, Task 7 frontend.
- Analytics: Task 5 backend and Task 7 frontend.
- Admin login/status: Task 2 backend and Task 8 frontend.
- Household/invite/member/category admin: Task 3 backend and Task 8 frontend.
- CSV export: Task 5 backend and Task 8 frontend.
- Docs and verification: Task 9.

Placeholder scan:

- No unfinished-marker text or intentionally vague implementation placeholders are present.
- Some frontend component internals are specified at feature level rather than full source listings because they are large UI components; implementation must still follow the exact file boundaries, views, API methods, and verification commands above.

Type consistency:

- Backend names use `Household`, `Member`, `InviteCode`, `Category`, `Expense`, `AnalyticsSummary`, and `AdminStatus`.
- Frontend API types should mirror those names in `apps/desktop/src/api/types.ts`.
- Auth uses bearer tokens for both device and admin, with separate localStorage keys.
