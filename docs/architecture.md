# Architecture

Home Finance is a small self-hosted collaborative household expense tracker.

## Runtime Shape

The React/Tauri client owns the user experience and can target desktop and Android through Tauri 2. The Go API owns all authoritative data and exposes two HTTP surfaces:

- Device API under `/api` for household members joining by invite code, managing expenses, listing categories, and reading analytics.
- Admin API under `/admin` for household setup, invite code generation, member/category management, status checks, and CSV export.

SQLite is the source of truth for households, members, invite codes, categories, expenses, and admin sessions. The API runs migrations at startup and stores data in `HOME_FINANCE_DB_PATH`.

## Auth Model

Device access starts with an invite code. A successful `/api/join` creates a member and returns a bearer token. Device routes resolve the bearer token to a member session and scope all reads/writes to that member's household.

Admin access uses `HOME_FINANCE_ADMIN_PASSWORD`. `/admin/login` returns a short-lived admin bearer token stored separately from the device token in the client. Admin routes require that token for setup, management, and export actions.

## Client Modes

The frontend has two modes:

- Device mode for service connection, invite-code join, expense CRUD, monthly analytics, and local settings.
- Admin mode for login, status, household creation, invite code generation, member/category management, and authenticated CSV export.

Both modes share the service URL setting. Member and admin tokens are stored under separate `homeFinance.*` localStorage keys.

## Data Boundaries

The API enforces household scoping in store queries and handlers. Expense writes derive member ownership from the authenticated device session. CSV export joins members and categories through the expense household to avoid cross-household name leakage.

SQLite remains the only persistence layer for the MVP. Future sync, budgeting, or multi-device conflict handling should build on this API boundary rather than letting clients write directly to the database.
