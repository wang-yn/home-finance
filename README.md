# Home Finance

Multiple people jointly record and analyze household financial expenses.

## Stack

- Frontend: React + TypeScript + Vite
- App shell: Tauri 2, prepared for Android
- Backend: Go + Gin HTTP API
- Database: SQLite

## Layout

- `apps/desktop`: React/Tauri client
- `services/api`: Go API and SQLite schema
- `docs`: project notes

## Project Standards

- 单元测试优先：新功能、缺陷修复和重构默认先补单元测试。
- 代码提交规范：使用 Lora 规范，提交消息使用中文。
- 详细规范见 `docs/project-standards.md`。

## Backend

The API listens on `:8080` by default.

Environment variables:

- `HOME_FINANCE_DB_PATH`: SQLite database path. Default: `home-finance.db`.
- `HOME_FINANCE_ADMIN_PASSWORD`: required for admin login. Default development fallback is `admin`.

Start the API:

```sh
cd services/api
HOME_FINANCE_DB_PATH=./home-finance.db HOME_FINANCE_ADMIN_PASSWORD=admin go run ./cmd/server
```

Core endpoints:

- `GET /health`
- `POST /api/join`
- `GET /api/me`
- `GET /api/categories`
- `GET /api/expenses?month=YYYY-MM`
- `POST /api/expenses`
- `PATCH /api/expenses/:expenseID`
- `DELETE /api/expenses/:expenseID`
- `GET /api/analytics/monthly?month=YYYY-MM`
- `POST /admin/login`
- `GET /admin/status`
- `GET /admin/households`
- `POST /admin/households`
- `POST /admin/households/:householdID/invite-codes`
- `GET /admin/exports/expenses.csv?householdId=ID&month=YYYY-MM`

## Frontend

Install dependencies:

```sh
cd apps/desktop
npm install
```

Run the web frontend:

```sh
cd apps/desktop
npm run dev
```

Run the Tauri app:

```sh
cd apps/desktop
npm run tauri dev
```

The first screen defaults to the device experience. Use the mode switch at the top to open the admin console.

## Basic Workflow

1. Start the API with `HOME_FINANCE_ADMIN_PASSWORD` set.
2. Open the frontend and switch to `管理后台`.
3. Log in with the admin password.
4. Create a household from `家庭`.
5. Select the household and generate an invite code from `邀请码`.
6. Switch back to `设备端`.
7. Connect to the API service URL, then join with the invite code and a nickname.
8. Record expenses, review monthly analytics, and export CSV from the admin console.

## Verification

Backend:

```sh
cd services/api
go test ./...
go vet ./...
```

Frontend:

```sh
cd apps/desktop
npm run test
npm run lint
npm run build
```

Tauri:

```sh
cd apps/desktop/src-tauri
cargo check
```

On Linux, `cargo check` may require system packages such as `libdbus-1-dev`.
