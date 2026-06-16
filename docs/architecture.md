# Architecture

Home Finance starts as a small local-first household expense tracker.

The React/Tauri client owns the user experience and can target desktop and Android through Tauri 2. The Go API owns data access and exposes a compact HTTP surface for household members, expense entry, and future analytics. SQLite is the single persistence layer for the initial version.

The first repository milestone is intentionally small:

- create a runnable React/Tauri shell
- create a runnable Go API backed by SQLite
- define the initial tables for households, members, categories, and expenses
- keep analytics and sync as later feature work
