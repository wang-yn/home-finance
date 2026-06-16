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

## Quick Start

Install dependencies:

```sh
cd apps/desktop
npm install
```

Run the API:

```sh
cd services/api
go run ./cmd/server
```

Run the frontend:

```sh
cd apps/desktop
npm run dev
```

Run the Tauri app:

```sh
cd apps/desktop
npm run tauri dev
```

## API

The API listens on `:8080` by default.

- `GET /health`
- `GET /api/households/:householdID/members`
- `GET /api/households/:householdID/expenses`
- `POST /api/households/:householdID/expenses`

Set `HOME_FINANCE_DB_PATH` to choose the SQLite file location.
