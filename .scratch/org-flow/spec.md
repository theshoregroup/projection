# Auth flow, org picker, dashboard, settings & org invite flow

Status: ready-for-agent (plan v3 — approved 2026-09-02)

Mirror the auth/navigation setup shared by `openrams` and `backbone` into
projection: a proper `/auth/v1` login flow, an organization picker, a
**org-gated** `/dashboard`, org settings pages, and the full organization
**invite flow** (the deferred item from ADR 0008 ships in this change).
Password sign-in / sign-up / recovery are **excluded** — projection is
Microsoft-SSO-only (ADR 0004).

**Owner decision (v2):** from this change, a user **must** have an active
organization to use the app. There is no "org-less" mode.

## Route map (before → after)

| Route | Today | After |
|---|---|---|
| `/` | Dashboard (via `_auth/index.tsx`) | **Redirect**: active org → `/dashboard`; signed in but no active org → `/auth/v1/organizations`; signed out → `/auth/v1/sign-in` |
| `/login` | Plain Microsoft card | Thin **redirect** → `/auth/v1/sign-in` (keeps old bookmarks/callbacks alive) |
| `/auth/v1` | — | Centered card layout, logo + app name (openrms `auth/v1/route.tsx`) |
| `/auth/v1/sign-in` | — | Microsoft-only card. Carries `?redirect=`. `beforeLoad`: session present → org-aware redirect (dashboard or picker). Microsoft `callbackURL` = `search.redirect ?? (active org ? "/dashboard" : "/auth/v1/organizations")` |
| `/auth/v1/organizations` | — | **Org picker** (openrms page, adapted — see below) |
| `/auth/v1/invites?inviteId=` | — | **Invitation accept/decline** card (openrms page). Not signed in → sign-in with `?redirect=` back here (Microsoft sign-in auto-creates the account in the tenant, ADR 0004) |
| `/dashboard` | — | Current dashboard content (`_auth/index.tsx` → `_org/dashboard.tsx`) |
| `/projects/:id`, `/admin` | Under `_auth` layout | Unchanged paths, now under `_org` layout (directory rename only) |
| `/settings` | — | **Org settings** under `_org`: tabs **Profile** + **Members** (incl. invite UI) |
| `/share/:token` | Public | Unchanged |

`_auth` route directory is renamed to `_org` (matches openrms vocabulary).
`/` is served by the new top-level redirect; the old `_auth/index.tsx` is
deleted and replaced by `_org/dashboard.tsx`.

## Access gate

The `_org` layout mirrors openrms `_org/route.tsx` exactly:

- no session → `redirect /auth/v1/sign-in?redirect=<current href>`
- session but no `activeOrganizationId` → `redirect /auth/v1/organizations?redirect=<current href>`
- else → context `{ session, user }`

Consequences:

- **Org-less users are soft-walled at the picker.** After the backfill, a
  user who signs in fresh is in no org until invited; the picker is their
  only screen until an invite is accepted.
- **The invite flow is therefore critical-path, not deferred** — this change
  wires `sendInvitationEmail` (below).
- Sign-out navigates to `/` (redirect logic lands the user on sign-in).
- The picker has **no "continue without an organization" escape** (openrms
  shape): it shows the user's orgs (TSG, "Active" badge), any pending
  invitations (accept inline → `setActive` → `/dashboard`), and sign-out.
  Zero orgs + zero invites → "No organizations yet — ask an admin to invite
  you" + sign-out.
- `project.organizationId` stamping (ADR 0008) needs no change — it now
  effectively always stamps, since no one reaches Project creation without an
  org. Legacy `null`-org projects are untouched.

**Board-link auto-switch (owner decision, v3):** opening a board link
(`/projects/:id`) by a user whose active org doesn't match the Project's org
(including users with *no* active org) should **attempt to switch** the
session to the Project's org rather than walling them at the picker:

- Lives in the `_org` layout `beforeLoad` (it runs before children; the
  layout already gates on the org): when the destination is a project route,
  fetch the Project (same `trpc.projects.byId` query the child will use —
  the shared query cache dedupes, no double round-trip), and if
  `project.organizationId` is set and differs from the session's
  `activeOrganizationId`, call `setActive` server-side (request headers) with
  that org id.
- **Success** (user is a member) → continue; the layout returns the session
  context with the switched `activeOrganizationId` (openrms does the same
  context-override in its `_org` route).
- **Failure** (most likely: not a member — better-auth verifies membership on
  `setActive`) or `project.organizationId` missing → fall back to the picker
  redirect with the board URL as `?redirect=`.
- Direct nav to a non-project route with a mismatched/missing active org is
  unchanged: straight to the picker.

## Org invite flow (new)

1. **Auth** (`packages/auth/src/auth.ts`): org plugin gains
   `sendInvitationEmail` — fires the `email.send` trigger.dev task (ADR 0005
   infra, already Resend-backed) from `Onboarding <onboarding@projection.com>`
   with the new `org-invite` template; accept URL =
   `${env.BETTER_AUTH_URL}/auth/v1/invites?inviteId=…`.
   `inviteMember` keeps default `autoAcceptEnabled: true`: inviting an email
   that already has a user **grants membership immediately, no email** —
   exactly right for a closed tenant where a colleague may already use the app.
2. **Template** (`packages/templates/src/emails/user/invite.tsx`): new
   react-email template — "X invited you to join **The Shore Group** on
   projection — sign in with your work Microsoft account, then accept."
   (The invitee lands on the invitation page post-sign-in via `?redirect=`.)
   Registered in the `email.send` task registry + discriminated union.
   **Drive-by fix:** `emails/user/verify-email.tsx`-sibling `welcome.tsx`
   currently declares `key: "user-invite"` (copy bug); rename to
   `key: "user-welcome"` so the new invite key doesn't collide.
3. **Web — settings/members**: "Invite member" dialog (openrms pattern, minus
   PostHog): email + role select (`member`/`admin`/`owner`, default member),
   `organization.inviteMember`; pending-invitations card lists them with a
   **revoke** action (`organization.removeInvitation`).
4. **Web — `/auth/v1/invites?inviteId=`** (openrms page, adapted):
   `organization.getInvitation`; signed-in → Accept / Decline cards
   (accept → `setActive` → `/dashboard`); not signed in → sign-in redirect
   carrying the invitation URL; expired/unknown id → not-found card.
5. **Auth config note:** invitation expiry stays the better-auth default
   (owner: leave as is).

## Settings pages (`/settings`, under `_org`)

Mirrors openrms `_org/settings`: title + `Tabs` (Profile / Members, via the
`useRouteTabs` URL-sync pattern). **No Teams tab** (teams off — ADR 0008); no
plan/billing cards.

- **Gate**: org `admin`/`owner` role via `requireOrgPermission`
  (`lib/permissions.ts`, openrms pattern: `organization.hasPermission` with
  SSR headers; deny → redirect `/dashboard`).
- **Profile** (`settings/index.tsx`): org name, slug, logo avatar
  (short-name fallback), member count, created date — `getFullOrganization`.
- **Members** (`settings/members.tsx`): sortable table
  (`@tanstack/react-table` + existing `ui/table`): name / email / role badge /
  joined date (`listMembers`); **Remove member** action + invite dialog +
  pending invitations (above). No pagination (single company org).

## Root / session plumbing (inherit from openrms `__root`)

- `__root.tsx`: `getSession` server fn (`auth.api.getSession` with request
  headers) in `beforeLoad` → `{ session, user }` in router context; `AuthGate`
  component calling `router.invalidate()` on `authClient.useSession()`
  changes. (Currently missing — needed for reliable post-OAuth-callback
  re-routing.) PostHog: **not ported** (projection has none).
- New `lib/auth-headers.ts` (`getSsrHeaders`, openrms file) — used by every
  SSR `authClient` call.
- `lib/auth-client.ts`: add `inferAdditionalFields<typeof auth>()` (types
  `user.role`), keep `organizationClient` (register `ac`/`roles` from the new
  org permissions module for typed `hasPermission`), add `useSignOut()`
  (openrms pattern minus PostHog, navigates to `/`).
- `functions/get-user.ts` + `middleware/auth.ts` deleted — superseded by
  context-from-`__root`.

## Auth package (`packages/auth`)

- New `src/organization/permissions.ts` (openrms pattern, trimmed):
  `createAccessControl(defaultStatements)` + `owner`/`admin`/`member` roles
  from `better-auth/plugins/organization/access`, `checkRoleForSuperuser`,
  inferred `organizationPermissionsSchema` + `organizationAc` exports.
- `auth.ts`: org plugin gains `ac` + `roles` + `sendInvitationEmail`
  (+ `sendInvitationEmail`). **No coercion added** (ADR 0008:
  config grants nothing); `allowUserToCreateOrganization: false`,
  `disableOrganizationDeletion: true`, `membershipLimit: 10_000` unchanged.
- Export `Session` + org permissions from the package index.
- ⚠️ DAC now enforces role checks on org management endpoints (listMembers,
  removeMember, invite…). Intended: makes the settings gate real. Verify
  plain-`member` reads (own membership, `list`) still work for the picker.

## Web components

- **UI kit** (`@projection/ui`, base-nova — same family as openrms): add
  `item` (picker rows), `tabs` (settings), `field` + `input` (invite dialog),
  `select` (invite role), `alert` (invite error state) via the shadcn CLI.
- `components/navigation/user-menu.tsx` (openrms pattern): avatar + active
  org label, **Switch organization**, **Organization settings** (superuser
  roles only), **User management** (instance admin only — current behavior),
  **Sign out** (`useSignOut`).
- `components/navigation/external.tsx` (openrms pattern): top bar for
  unauthenticated surfaces (logo + Login / "Your dashboard" + avatar menu).
- Sidebar (`_org/route.tsx`): header shows active org short name/logo next to
  the "Projection" brand; nav = current "My Projects" + per-project entries +
  **Settings** (superuser only).
- `utils/auth.ts` `getOrgShortName` helper ported.
- Org picker: **no "Create a New Organization" row** (creation disabled by
  config). PostHog calls stripped.

## Out of scope (explicit)

- Password sign-in / sign-up / recovery (ADR 0004).
- Teams, billing/plan, PostHog, org-scoped Project **access** (ADR 0008).
- Backfill script — unchanged (still the only *bulk* grant).

## Files (summary)

**New (web)**: `routes/index.ts`; `routes/auth/v1/{route,sign-in,organizations,invites/index}.tsx`;
`routes/_org/{route,dashboard,settings/{route,index,members}}.tsx` (route +
dashboard migrated from `_auth`); `lib/{auth-headers,permissions}.ts`,
`components/navigation/{user-menu,external}.tsx`,
`components/member/invite-dialog.tsx`.
**Changed (web)**: `routes/__root.tsx`, `lib/auth-client.ts`,
`routes/_org/{projects/$projectId,admin}.tsx` (renamed from `_auth`),
`routes/login.tsx` (→ redirect).
**Deleted (web)**: `routes/_auth/*` (replaced), `functions/get-user.ts`,
`middleware/auth.ts`.
**UI kit**: `components/{item,tabs,field,input,select,alert}.tsx`.
**Auth pkg**: `src/organization/permissions.ts`, `auth.ts` (ac/roles/
sendInvitationEmail/invitations), index exports.
**Templates**: `src/emails/user/invite.tsx` (new), `welcome.tsx` key fix.
**Tasks**: `email.task.ts` registry + discriminated union entry.
**Docs**: ADR 0009 (route surface, org-required gate, org DAC roles, invite
flow now shipped) + update ADR 0008 "deferred" lines + CONTEXT.md Organization
term (drop "deferred").

## Verification

1. `pnpm check:types` + `pnpm build` (web, ui, auth, tasks, templates) —
   routeTree regen clean.
2. Signed out: `/` → sign-in card; `/share/:token` public; `/admin` → sign-in.
3. Backfilled user (active org): `/` → `/dashboard`; MS sign-in callback →
   `/dashboard`; picker shows TSG Active; non-superuser has no Settings entry
   and `/settings` direct URL bounces to `/dashboard`.
4. **Invite, existing user**: admin invites a colleague who already signed in
   → auto-accepted, appears in member table immediately, no email sent.
5. **Invite, new user**: admin invites a tenant user who has never signed in →
   invitation row + Resend email (`org-invite`); they open the link → sign-in
   (account auto-created in tenant) → redirected to invitation page → Accept
   → `setActive` → `/dashboard`; project creation stamps the org.
6. Org-less / mismatched-org user opening a board link → auto-switches when a
   member of the Project's org (lands on the board); non-member → picker with
   `?redirect=` back to the board; after accepting an invite, returns to the
   board URL.
7. Org-less user hitting a non-project app URL → picker with `?redirect=`.
8. Sign out → `/` → sign-in card; session change re-routes (AuthGate).
9. Expired/unknown invite id → not-found card.

## Decisions (all resolved with owner, v3)

1. **No `/home` landing page** — unauthenticated `/` goes straight to the
   sign-in card.
2. **Invite roles unrestricted** — member / admin / owner offered as-is.
3. **Invitation expiry left at the better-auth default.**
4. **`_auth` → `_org` rename** ok (public URLs unchanged).
5. **Board links auto-switch** the session to the Project's org, falling back
   to the picker when the switch fails (see Access gate).
