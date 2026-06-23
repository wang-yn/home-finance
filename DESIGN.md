# Design

## Source of truth
- Status: Active
- Last refreshed: 2026-06-22
- Primary product surfaces: React Web client in `apps/web`, Tauri desktop and Android shell in `apps/tauri`, Go-served web UI from `services/api`.
- Evidence reviewed:
  - `README.md`: product stack, deployment shape, current user workflow, service URL behavior.
  - `docs/architecture.md`: device API/admin API split, token boundaries, client modes.
  - `docs/superpowers/specs/2026-06-16-home-finance-feature-design.md`: MVP goals, device pages, admin pages, error handling, navigation intent.
  - `apps/web/src/App.tsx`: current top-level device/admin mode switch.
  - `apps/web/src/components/DeviceApp.tsx`: current device connection, join, authenticated views, settings, expense, analytics flows.
  - `apps/web/src/components/AdminApp.tsx`: current admin login and authenticated management views.
  - `apps/web/src/App.css` and `apps/web/src/index.css`: current responsive layout, panel, nav, form, metric, and color treatment.
  - `apps/web/src/storage/session.ts`: service URL and token persistence, default URL behavior.
  - `apps/tauri/src-tauri/tauri.conf.json` and Tauri source files: app shell exists, but the web app currently has no dedicated platform helper for app-only UI.

## Brand
- Personality: quiet, trustworthy, domestic, efficient; closer to a lightweight finance tool than a marketing site.
- Trust signals: clear login boundary, predictable navigation, readable numbers, explicit sync/error states, no surprise access to authenticated screens.
- Avoid: decorative dashboards, oversized hero layouts, dark or heavy gradients, playful illustrations, dense admin chrome before authentication, and generic SaaS marketing copy.

## Product goals
- Goals:
  - Help family members record expenses with low friction on mobile and desktop.
  - Keep self-hosted deployment understandable: web served by API should work with its current origin; Tauri app can configure a custom service address.
  - Let an administrator manage households, invites, members, categories, and exports through a compact console.
  - Make unauthenticated states visually and functionally narrow.
- Non-goals:
  - No public landing page.
  - No multi-tenant SaaS console.
  - No complex charting library for MVP analytics.
  - No service address controls in normal browser web UI unless running inside the packaged app shell.
- Success signals:
  - When not logged in, users see only the relevant login/join box and essential errors.
  - Service address editing appears only in Tauri/app runtime.
  - Authenticated device and admin surfaces have different navigation patterns suited to mobile and PC.
  - Primary actions are obvious without competing cards or duplicated navigation.

## Personas and jobs
- Primary personas:
  - Family member: joins by invite code, records expenses, checks monthly totals and recent records.
  - Household administrator: creates households, generates invite codes, manages members/categories, exports CSV.
  - Self-hosting operator: deploys the API and needs a simple way to verify service status.
- User jobs:
  - Join a household quickly from a phone or desktop.
  - Add, edit, and remove expenses without hunting through admin concepts.
  - Review monthly spend by category and member.
  - Set up family access and export data when needed.
- Key contexts of use:
  - Mobile one-handed daily entry.
  - Desktop management and review.
  - Tauri app connected to a self-hosted API address.
  - Browser web UI served from the API origin where custom service URL is unnecessary.

## Information architecture
- Primary navigation:
  - Public unauthenticated state: no app-wide navigation and no mode switch inside the main surface. Show one centered auth panel for the selected entry.
  - Device authenticated state: bottom navigation on mobile; compact top or left navigation on wider screens. Core tabs: Overview, Expenses, Analysis, Settings.
  - Admin authenticated state: side navigation on desktop; compact top navigation or menu sheet on mobile. Core tabs: Status, Households, Invites, Members, Categories, Export.
- Core routes/screens:
  - Device public: Join household. In app runtime only, include service address setup before or inside join.
  - Device authenticated: Overview, Expense form/list, Analysis, Settings.
  - Admin public: Admin login only.
  - Admin authenticated: Status, Households, Invites, Members, Categories, Export.
- Content hierarchy:
  - Authentication screens prioritize title, one sentence of context, required fields, primary submit, and one error/status region.
  - Device overview prioritizes this month's total, quick add, recent expenses, then secondary metrics.
  - Expense screen prioritizes entry form on mobile and list management on desktop.
  - Admin screens prioritize selected household context, then task form, then list/table.

## Design principles
- Principle 1: Authentication is a hard visual boundary. Unauthenticated users must not see authenticated navigation, month controls, settings, metrics, admin sidebar, or cross-mode clutter.
- Principle 2: Device and admin are separate jobs. Avoid a global mode switch that makes the product feel like a demo. Expose admin entry deliberately, such as a stable `/admin` route or an authenticated admin shell, rather than as a prominent tab beside family recording.
- Principle 3: Platform-specific controls stay platform-specific. Service URL editing belongs to app runtime because browser/API-served web already knows its origin.
- Principle 4: Dense but calm. Use restrained spacing, clear hierarchy, small radii, readable tables/lists, and limited color.
- Tradeoffs:
  - A small amount of routing/platform plumbing is preferable to continuing with one global mode switch.
  - Mobile favors task sequencing and one primary action per screen; desktop can show form and list side by side.
  - MVP analytics should use lists and proportional bars before adding chart dependencies.

## Visual language
- Color:
  - Base background: light neutral gray.
  - Surface: white.
  - Text: near-black blue/gray for readability.
  - Primary action: calm teal/green, used sparingly.
  - Danger: muted red only for destructive actions.
  - Category colors: displayed as small swatches, not dominant page backgrounds.
- Typography:
  - Use system sans-serif stack already present in `apps/web/src/index.css`.
  - Keep headings compact in app panels; no hero-scale type inside operational screens.
  - Use tabular number alignment where possible for finance amounts.
- Spacing/layout rhythm:
  - Desktop shell width can remain around `1120px`, but PC layouts should use intentional columns: navigation/context/action.
  - Mobile uses 16px page padding, 12px control gaps, and fixed-height bottom navigation to avoid layout shifts.
- Shape/radius/elevation:
  - Continue with 8px or smaller radii for panels and controls.
  - Prefer borders and subtle background contrast over drop shadows.
- Motion:
  - Minimal motion. Avoid animated decoration. Respect reduced motion.
- Imagery/iconography:
  - Operational screens do not need decorative imagery.
  - Use simple icons only where they improve command recognition, such as add, edit, delete, export, copy, settings.

## Components
- Existing components to reuse:
  - API client helpers in `apps/web/src/api/client.ts`.
  - Token/service persistence in `apps/web/src/storage/session.ts`.
  - Expense form/list/analytics list patterns in `DeviceApp.tsx`.
  - Admin metric/list/form patterns in `AdminApp.tsx`.
  - Existing CSS class families for panel, metric, form, status, and list rows, after reorganizing ownership.
- New/changed components:
  - `AppShell`: decides public vs authenticated shell and app runtime capability.
  - `AuthGate`: renders only login/join content before authentication.
  - `PlatformProvider` or `platform.ts`: exposes `isAppRuntime` for Tauri-only controls.
  - `DevicePublicEntry`: join form plus app-only service address setup.
  - `AdminPublicLogin`: login-only panel.
  - `DeviceShell`: authenticated device header, month selector, responsive nav, content outlet.
  - `AdminShell`: authenticated admin sidebar/top nav and content outlet.
  - `ServiceAddressField`: reusable but only mounted when `isAppRuntime` is true.
  - `BottomNav` and `SideNav`: separate responsive navigation primitives.
- Variants and states:
  - Auth panel: default, loading, error.
  - Service address field: hidden in web runtime, editable in app runtime, testing, connected, failed.
  - Expense row: default, editing, destructive confirmation pending.
  - Admin list row: active, disabled, selected.
- Token/component ownership:
  - Keep tokens in CSS variables at `:root` or `.app-shell` before adding any external design-system dependency.
  - Component-level CSS should describe layout responsibility, not business mode.

## Accessibility
- Target standard: WCAG 2.1 AA where practical for MVP.
- Keyboard/focus behavior:
  - Forms submit with Enter.
  - Navigation buttons/links have visible focus states.
  - Destructive actions require an accessible confirmation state instead of relying only on `window.confirm` or implicit intent.
- Contrast/readability:
  - Body text and controls must meet AA contrast on light backgrounds.
  - Status colors need text labels; color alone cannot indicate success/error.
- Screen-reader semantics:
  - Auth forms use a single `main` landmark and one `form` with explicit labels.
  - Authenticated shells use `nav` with meaningful labels.
  - Error/status regions should be announced via `role="alert"` or `aria-live`.
- Reduced motion and sensory considerations:
  - No required motion for comprehension.
  - Avoid flashing states.

## Responsive behavior
- Supported breakpoints/devices:
  - Mobile: 320px and up.
  - Tablet/narrow desktop: 760px and up.
  - Desktop: 1024px and up.
- Layout adaptations:
  - Unauthenticated mobile and desktop both show one auth card/panel, centered with constrained width.
  - Device mobile: bottom navigation, one-column screens, quick-add first.
  - Device desktop: overview metrics in grid; expense form/list in two columns; filters stay above list.
  - Admin desktop: persistent side navigation and task panels/tables.
  - Admin mobile: login remains single panel; authenticated admin navigation collapses to top segmented nav or menu.
- Touch/hover differences:
  - Mobile controls need at least 44px target height.
  - Hover-only affordances are not allowed for edit/delete/copy/export.

## Interaction states
- Loading:
  - Disable only the submitting control or affected region when possible.
  - Use concise labels such as "连接中", "登录中", "保存中".
- Empty:
  - Empty states should include the next useful action when authenticated.
  - Public auth empty state should not mention unavailable app sections.
- Error:
  - Place errors near the form or shell region that caused them.
  - Token expiration returns to the relevant public auth panel and clears only the invalid token.
- Success:
  - Show short, dismissible or automatically replaceable status messages.
- Disabled:
  - Disabled controls need visible contrast and should explain missing prerequisites when not obvious.
- Offline/slow network, if applicable:
  - MVP has no offline write queue. Failed network requests should keep form input intact and offer retry.

## Content voice
- Tone: concise, practical, neutral Chinese.
- Terminology:
  - Use "家庭账本", "邀请码", "成员", "支出", "分类", "导出", "管理后台".
  - Use "服务地址" only for app runtime connection settings.
- Microcopy rules:
  - Button labels should be verbs: "加入", "登录", "记录", "保存", "导出", "复制", "停用".
  - Avoid explaining internal implementation such as tokens or API paths in normal UI.
  - Error messages should say what failed and what the user can try next.

## Implementation constraints
- Framework/styling system:
  - React + TypeScript + Vite in `apps/web`.
  - Tauri 2 app shell in `apps/tauri`.
  - No new UI framework or chart dependency unless explicitly approved.
- Design-token constraints:
  - Introduce CSS custom properties before refactoring component styles.
  - Keep radii at 8px or less.
  - Avoid one-note palettes; do not let the UI become all teal/blue/gray.
- Performance constraints:
  - Keep initial public auth screens lightweight.
  - Avoid loading authenticated data until the relevant token exists.
- Compatibility constraints:
  - Web served from the API should default to `window.location.origin`.
  - Tauri/app runtime can fall back to `http://localhost:8080` and expose custom service address editing.
  - Service URL state remains shared between device and admin clients, but editing is app-only.
- Test/screenshot expectations:
  - Add tests around platform detection and public auth gating.
  - Add component tests that unauthenticated device/admin states do not render authenticated navigation or settings.
  - Run `npm run lint` and `npm run build` in `apps/web` for frontend changes.

## Refactor plan
- Phase 1: Lock current business behavior with tests.
  - Add tests for `loadServiceUrl` default behavior and new `isAppRuntime` helper.
  - Add React tests for unauthenticated device view rendering only the join/auth panel plus app-only service controls.
  - Add React tests for unauthenticated admin view rendering only login content.
- Phase 2: Separate platform and auth gates.
  - Add a small platform helper that detects Tauri/app runtime in one place.
  - Replace the always-visible root mode switch with explicit app sections: device entry by default and admin entry by route or a low-prominence authenticated/admin-only entry.
  - Gate authenticated shells behind token/session state.
- Phase 3: Restructure device UI.
  - Public device: show only join form; include service address setup only when `isAppRuntime` is true.
  - Authenticated device: show month control and navigation only after session exists.
  - Move service address editing from general browser settings to app-only settings.
  - Use mobile bottom nav and desktop top/side navigation instead of the current six-button strip everywhere.
- Phase 4: Restructure admin UI.
  - Public admin: show only the login panel, without sidebar, status metrics, household nav, or device/admin switch.
  - Authenticated admin: restore sidebar/top nav and management views.
  - Keep selected household context persistent and visually separate from navigation.
- Phase 5: Visual simplification.
  - Convert hard-coded colors into CSS variables.
  - Reduce panel nesting and repeated card treatment.
  - Tighten PC grid layouts and mobile single-column flow.
  - Add focus, live status, empty, and destructive states.
- Phase 6: Verify.
  - Run `npm run test`, `npm run lint`, and `npm run build` in `apps/web`.
  - Capture desktop and mobile screenshots after implementation to confirm unauthenticated and authenticated layouts do not overlap or expose wrong controls.

## Acceptance criteria for the requested redesign
- Unauthenticated device/browser web:
  - Shows only the join/login-required panel for family access.
  - Does not show the device/admin global mode switch.
  - Does not show service address editing.
  - Does not show month selector, device nav, settings, metrics, expense list, or analysis.
- Unauthenticated device/app runtime:
  - Shows only the public join panel plus service address setup/testing.
  - Does not show authenticated device nav or data.
- Unauthenticated admin:
  - Shows only the admin login panel.
  - Does not show admin sidebar/nav, status cards, household controls, or device views.
- Authenticated device:
  - Shows device navigation and finance content only after a valid member token/session exists.
  - Mobile layout prioritizes quick recording and bottom navigation.
  - PC layout uses a clear overview grid and two-column expense management where space allows.
- Authenticated admin:
  - Shows admin navigation only after a valid admin token exists.
  - PC layout uses a stable side navigation and task-focused content panels.
  - Mobile layout remains usable without horizontal overflow.

## Open questions
- [ ] Should admin live under a dedicated `/admin` route, or remain accessible from a discreet entry in the app shell? Owner: product/engineering. Impact: routing and visibility of admin login.
- [ ] In browser web UI, should family members join directly against current origin without an explicit connection test, or should `/health` be checked automatically before join? Owner: engineering. Impact: public auth flow.
- [ ] Should the Tauri desktop and Android apps share identical service address UI, or should Android prioritize QR/deep-link setup later? Owner: product. Impact: app-only setup ergonomics.
