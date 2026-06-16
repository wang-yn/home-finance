# Release Build Design

## Goal

When a `v*` tag is pushed, GitHub Actions publishes a backend Docker image and attaches an Android APK to a GitHub Release. The backend container stores SQLite data under a persistent `/data` directory, and the repository provides a `docker-compose.yml` for self-hosted deployment.

## Approach

- Use GitHub Container Registry as the default image registry.
- Build the Go API with a multi-stage Dockerfile and run it as a small non-root runtime image.
- Set `HOME_FINANCE_DB_PATH=/data/home-finance.db` in the container and mount a Compose named volume to `/data`.
- Build Android with Tauri 2 in GitHub Actions using Rust, Node, Java, Android SDK/NDK, and the Tauri CLI.
- Upload the APK as a GitHub Release asset. Signing and Play Store/AAB publishing are intentionally out of scope for this first release pipeline.

## Files

- `.github/workflows/release.yml`: tag-triggered release workflow.
- `services/api/Dockerfile`: backend image build.
- `.dockerignore`: trims build context.
- `docker-compose.yml`: self-hosted API runtime with persistent SQLite volume.
- `README.md`: release, Docker, and Compose usage.

## Validation

- Docker image build succeeds locally.
- Compose configuration parses.
- Workflow YAML parses.
- Existing backend and frontend verification commands still pass where applicable.

