# Release Builds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tag-triggered GitHub release builds for the backend Docker image and Android APK, plus Docker Compose deployment with persistent SQLite data.

**Architecture:** The backend uses a multi-stage Docker build and persists SQLite under `/data`. GitHub Actions builds and pushes the API image to GHCR, builds the Tauri Android APK, and uploads release assets on `v*` tags.

**Tech Stack:** GitHub Actions, Docker Buildx, GHCR, Go, SQLite, Node/Vite, Rust/Tauri 2, Android SDK/NDK.

---

### Task 1: Backend Docker Runtime

**Files:**
- Create: `services/api/Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Create Dockerfile**

Create a multi-stage Dockerfile that builds `services/api/cmd/server` and runs it from a non-root Alpine image with `/data` as the SQLite volume.

- [ ] **Step 2: Create Docker ignore rules**

Exclude build outputs, VCS metadata, SQLite files, and dependency caches from Docker contexts.

- [ ] **Step 3: Verify Docker build**

Run: `docker build -f services/api/Dockerfile -t home-finance-api:test .`

Expected: image builds successfully.

### Task 2: Compose Deployment

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: Create compose service**

Define `api` with port `8080:8080`, `HOME_FINANCE_DB_PATH=/data/home-finance.db`, required admin password environment, named volume `home-finance-data:/data`, and a healthcheck using `/health`.

- [ ] **Step 2: Verify compose config**

Run: `docker compose config`

Expected: parsed service and volume are printed without errors.

### Task 3: Tag Release Workflow

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Add release workflow**

Trigger on `push` tags matching `v*`. Add a Docker job that logs into GHCR, builds `services/api/Dockerfile`, and pushes semver/latest tags. Add an Android job that installs Node, Rust, Java, Android SDK/NDK, Tauri prerequisites, runs frontend tests/lint/build, initializes Android if needed, builds APK, and uploads APKs to a GitHub Release.

- [ ] **Step 2: Verify YAML parse**

Run a local YAML parse command against `.github/workflows/release.yml`.

Expected: parser exits 0.

### Task 4: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Document Docker Compose**

Add deployment commands for setting `HOME_FINANCE_ADMIN_PASSWORD`, starting Compose, reading logs, stopping, and identifying the persistent volume.

- [ ] **Step 2: Document tag release**

Add commands for creating and pushing a `v*` tag and list expected release artifacts.

### Task 5: Final Verification And Commit

**Files:**
- All files touched by Tasks 1-4.

- [ ] **Step 1: Run backend checks**

Run: `cd services/api && go test ./... && go vet ./...`

Expected: passes.

- [ ] **Step 2: Run frontend checks**

Run: `cd apps/desktop && npm run test && npm run lint && npm run build`

Expected: passes.

- [ ] **Step 3: Run Docker and Compose checks**

Run: `docker build -f services/api/Dockerfile -t home-finance-api:test .` and `docker compose config`.

Expected: both pass.

- [ ] **Step 4: Commit**

Commit message: `feat(发布): 增加标签构建和容器部署`

