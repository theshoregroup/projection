# projection — v1 Implementation Plan

Approved 2026-07-29 via grilling session. Execute phases in order. Phase 0 file contents are embedded below verbatim — write them exactly as shown.

## Locked decisions (shared understanding v2)

- **Domain:** Project (name required, description optional, seed dates, derived Timeline Window = min(Line starts)→max(Line ends), auto-expands, never clamps) · Line (Item required; Start/End required date-only, End ≥ Start; Assignee/Note optional free text; % Complete 0–100 default 0; Milestone toggle → diamond on single day; manual row order) · Milestones + % complete in scope; dependencies/subtasks/critical path out of scope.
- **Access:** Owner (sole membership/share/delete powers) · Editor (content-only) · Pending Invite (email grant, auto-converts on first Microsoft sign-in, revocable) · Share Link (one public regeneratable token URL per Project, read-only, no login) · Admin (user management only, no project access, `ADMIN_EMAILS` bootstrap).
- **Auth:** better-auth — Microsoft OAuth only, single Entra tenant, open signup within tenant, admin plugin, NO organization plugin, email/password removed.
- **Feel:** local-app feel is a core tenet → TanStack DB `queryCollection` over tRPC, optimistic mutations + rollback, live-queries. Freshness: focus refetch + ~20s poll on open boards. Last-write-wins. Offline (Electric) deferred.
- **Board:** hybrid render — pure layout functions → SVG geometry + DOM overlays. Auto-scale + horizontal-only zoom bar, calendar days, weekend shading, fixed row height, hash-palette bar colors keyed by Assignee. Interactions: dialogs for full edit, drag move/resize, row reorder handles.
- **Infra:** PlanetScale Postgres + Drizzle (`DATABASE_URL`, auth tables in `auth` schema) · email via trigger.dev `email.send` task → Resend, templates in `packages/templates` · PDF export DEFERRED (react-pdf over shared layout functions later).
- **Housekeeping:** `appName: "cibiprojection"` → `"projection"`; `packages/db/tests/` orphaned (references non-existent schemas from another product) — delete domain tests + `test-db.ts`, keep `connection.ts`/`global-setup.ts`; add `TRIGGER_PROJECT_ID`/`TRIGGER_SECRET_KEY` (optional) to env schema.

---

## Phase 0 — Docs & housekeeping

### Write `CONTEXT.md`

```md
# Projection

A Microsoft Project–style planning tool: users build Projects whose Boards render timelines of dated Lines. Single context for the whole repo.

## Language

### Planning

**Project**:
A named plan owned by exactly one user. Its visible date extent is the Timeline Window, derived from its Lines.
_Avoid_: plan, board (the Board is the view, not the container)

**Line**:
A single dated entry in a Project: Item (title), Start and End (date-only), optional Assignee and Note, % Complete, an optional Milestone toggle, and a manual row order.
_Avoid_: task, bar, row, card

**Milestone**:
A Line with its Milestone toggle set. It occupies a single day and renders as a diamond.
_Avoid_: checkpoint, deadline

**% Complete**:
A Line's progress as a whole number from 0 to 100, shaded along its bar on the Board.
_Avoid_: progress

**Timeline Window**:
The Project's visible date range: earliest Line Start to latest Line End, falling back to the Project's seed dates while it has no Lines. The window grows automatically and never clamps Lines.
_Avoid_: project dates, date range

**Board**:
The timeline view of a Project: one row per Line, bars spanning Start to End inside the Timeline Window, weekends shaded, bars colored by Assignee.
_Avoid_: kanban, chart

### Access

**Owner**:
The user who created a Project. Sole holder of membership, Share Link, and deletion powers.
_Avoid_: creator, admin (Admin means something else here)

**Editor**:
A user granted edit access to a Project by its Owner. Can change content (Lines, Project name and seed dates) but never membership.
_Avoid_: member, collaborator, viewer

**Pending Invite**:
An email address granted Editor access that has not yet signed in. Converts to Editor automatically on first Microsoft sign-in and is revocable until then.
_Avoid_: invitation request

**Share Link**:
A Project's single public, regeneratable token URL granting read-only Board access without sign-in.
_Avoid_: public link, view-only link

**Admin**:
A user with instance-wide user-management powers (list, ban, delete users, grant Admin). Has no special access to Project contents. Bootstrapped via the ADMIN_EMAILS environment variable.
_Avoid_: superuser, owner
```

### Write `docs/adr/0001-hybrid-board-rendering.md`

```md
# Board renders hybrid: SVG geometry, DOM overlays

The Board's geometry (axis, bars, milestone diamonds, % Complete shading) is drawn as SVG from pure layout functions (`lines + timeline window + zoom → positions`), while labels, tooltips, and menus are DOM overlays. SVG keeps the deferred PDF export write-once — react-pdf consumes an SVG subset but not arbitrary DOM, so the same layout functions will feed both renderers. DOM overlays give native text truncation, tooltips, and accessibility where geometry isn't involved.

## Considered Options

- **Pure DOM/divs** — rejected: kills the write-once PDF path; a second layout would be needed at export time.
- **Pure SVG** — rejected: text truncation, tooltips, and accessibility all become manual work for no layout benefit.
```

### Write `docs/adr/0002-tanstack-db-online-only.md`

```md
# Local-app feel via TanStack DB over tRPC; offline-first deferred

"Feels like a local app" is a core tenet of the product. v1 achieves it with TanStack DB `queryCollection`s synced from the tRPC API: mutations apply optimistically to local collections with rollback on error, live-queries make UI reactive across components, and incoming sync is pull-based (refetch on focus/invalidation plus a ~20s poll while a Board is open).

True offline-first — a persisted local database plus push sync via Electric — is explicitly **deferred**: it requires hosting a sync service and Postgres logical replication that is unverified on PlanetScale Postgres, plus conflict-resolution semantics, which would sink v1 scope.

## Consequences

- Online-only: without connectivity the app is at best read-only from cache.
- Concurrent edits are last-write-wins at the server; there are no presence indicators or live cursors.
- The upgrade path is swapping collection sync engines to `electricCollection`; mutation handlers and live-queries survive that swap, which is why this deferral is cheap to reverse later.
```

### Write `docs/adr/0003-planetscale-postgres-drizzle.md`

```md
# PlanetScale Postgres + Drizzle

Persistence is PlanetScale Postgres accessed through Drizzle ORM (node `pg` driver), with `DATABASE_URL` as the single connection env var. better-auth's tables live in a dedicated `auth` Postgres schema; application tables live in `public`.

Lock-in to both the provider and the ORM is accepted: the better-auth Drizzle adapter is first-class, Drizzle's type-safe lightness matches the stack, and the provider was provisioned by the owner directly.
```

### Write `docs/adr/0004-auth-shape.md`

```md
# Auth: Microsoft-only single tenant, admin plugin, no organizations

Sign-in is exclusively Microsoft OAuth against a single Microsoft Entra tenant, with open signup inside that tenant; email/password is removed entirely. Cross-project access is per-project Owner/Editor grants, so the better-auth organization plugin is deliberately absent — the **admin** plugin is used instead, strictly for user management (list/ban/delete users, grant admin), with the first admins bootstrapped from the `ADMIN_EMAILS` env var.

This combination surprises readers (admin plugin without organizations), so the reasoning is recorded: tenancy is handled by Entra itself, sharing is per-project by design, and admins get **no** access to project contents — preserving the "only Owner + Editors can view" privacy promise.

## Consequences

- Pending Invites auto-grant on first sign-in because Microsoft verifies the email address.
- Removing the email/password flow also removes the need for verify-email/password-reset templates (welcome + invite emails remain, sent via trigger.dev per ADR 0005).
```

### Write `docs/adr/0005-trigger-dev-background-work.md`

```md
# All background work runs on trigger.dev

Email — and any future CRON, long-running, or workflow task — runs as trigger.dev tasks in `packages/tasks`, rendering react-email templates from `packages/templates`. Each template carries a zod key+schema and is registered in a typed registry, so task payloads are validated end-to-end.

Direct Resend calls from tRPC handlers were rejected: the queue provides retries, idempotency keys, and concurrency limits off the Vercel function clock, and gives one home for all non-request work as the product grows.
```

### Write `.scratch/pdf-export/issues/01-pdf-export.md`

```md
Status: needs-triage

# Export a Project Board as PDF

Deliberately deferred from v1 (planning grill, 2026-07-29). A Project's Board should be exportable as a PDF from the project page.

## Pre-agreed approach

- Use `@react-pdf/renderer` in a server function.
- Do **not** re-implement layout: consume the same pure layout functions that drive the Board's SVG geometry (`lines + timeline window + zoom → positions`). react-pdf supports an SVG subset (`Svg`, `Rect`, `Text`, …), and the hybrid board (ADR 0001) exists partly to keep this write-once.
- PDF contents: project name, Timeline Window axis, one row per Line (bar or milestone diamond, % Complete shading, Item/Assignee/Note text), weekend shading.

## Open questions (when picked up)

- Fit: scale-to-width on one page, or paginate at natural zoom?
- Do Share Link viewers get PDF export too?

## Comments

- 2026-07-29: Filed as deferred during the grilling session. Approach agreed there; user constraint: "I only want to write the UI code once."
```

### Housekeeping edits

1. `packages/auth/src/auth.ts`: `appName: "cibiprojection"` → `"projection"`.
2. `packages/env/src/server.ts`: add optional `TRIGGER_PROJECT_ID: z.string().optional()` and `TRIGGER_SECRET_KEY: z.string().optional()`; uncomment the two dummy entries.
3. Delete orphaned tests: `packages/db/tests/{document,audit,template,file,variable}.test.ts` and `packages/db/tests/test-db.ts` (all reference non-existent schemas). Keep `connection.ts`, `global-setup.ts`, `vitest.config.ts`.

## Phase 1 — Auth

- `packages/auth`: `microsoft` social provider (single tenant via `AZURE_TENANT_ID`), `admin()` plugin, remove `emailAndPassword`, `ADMIN_EMAILS` bootstrap via user-create database hook.
- `packages/db`: admin-plugin columns on `auth.user` (role, banned, banReason, banExpires) + migration (`pnpm drizzle-kit generate` / push).
- `packages/env`: required `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`, `ADMIN_EMAILS` (comma-separated).
- `apps/web`: login page = Microsoft button only (strip email/password forms); auth client + `adminClient` plugin; session guard on app routes.

## Phase 2 — Domain schema + API

- `packages/db` (public schema): `project` (id, ownerId, name, description, seedStart, seedEnd, shareToken unique nullable, timestamps) · `line` (id, projectId→cascade, item, startDate, endDate, assignee, note, percentComplete, isMilestone, sortOrder, timestamps) · `project_editor` (id, projectId→cascade, userId nullable, email, status pending|active, timestamps; unique projectId+email).
- `packages/api` routers: `projects` (create/update/delete/regenerateShareLink), `lines` (create/update/delete/reorder), `sharing` (inviteByEmail/removeEditor/revokePending/list), `board.get` (project+lines one-shot), `share.getByToken` (public).
- Permission helpers `assertOwner`/`assertOwnerOrEditor`; pending-invite auto-grant hook on sign-in.
- Vitest: permission matrix, Timeline Window derivation, line validation.

## Phase 3 — App shell

Routes: `/login` · `/` dashboard (My projects / Shared with me) · `/projects/$id` · `/share/$token` · `/admin`. Create-project dialog (name, description, seed dates).

## Phase 4 — TanStack DB wiring

Shared zod schemas between tRPC + collections; `queryCollection`s (projects/lines/editors) with optimistic mutation handlers → tRPC, rollback + error toasts; `refetchInterval` ~20s on open board + focus refetch.

## Phase 5 — Board

- Pure layout module (`apps/web/src/lib/board-layout/`): px↔date, zoom state, ticks, weekend spans, assignee hash-palette, bar/diamond geometry. Vitest-covered.
- SVG layer + DOM overlays (labels, note truncation + tooltips, menus).
- Drag move/resize, row reorder handles, line dialog (milestone toggle collapses to single date, % slider), horizontal-only zoom bar.

## Phase 6 — Sharing

Editors panel (email lookup → active Editor or Pending Invite); `ProjectInviteEmail` template added to the trigger.dev registry; revoke pending; Share Link panel (copy/regenerate); public `/share/$token` (same renderer, no mutations).

## Phase 7 — Admin

`/admin` gated by role: user list, ban/unban, delete, grant/revoke admin via better-auth admin client.

## Phase 8 — Ship

Empty/error/loading states; `check-types` + `biome` green; drizzle migrate; trigger.dev deploy; Vercel env sync; `deploy:prod`.

## Facts owed by user

- `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` / `AZURE_TENANT_ID` (single-tenant Entra app registration)
- `ADMIN_EMAILS`
- Resend verified from-domain
- `TRIGGER_PROJECT_ID` / `TRIGGER_SECRET_KEY`
- Production `DATABASE_URL`
