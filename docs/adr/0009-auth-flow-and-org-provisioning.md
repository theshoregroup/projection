# Auth flow, organization picker, dashboard & invite provisioning

The web app now mirrors the route shape shared by openrams and backbone: a
proper `/auth/v1` sign-in flow, an organization picker, an organization-gated
`/dashboard`, organization settings, and the organization **invite flow**
(the deferred item from ADR 0008 ships in this change).

## Route surface

| Route | Behaviour |
|---|---|
| `/` | Redirect: active org → `/dashboard`; signed in without org → `/auth/v1/organizations`; signed out → `/auth/v1/sign-in` |
| `/login` | Redirect to `/auth/v1/sign-in` (old bookmarks / in-flight OAuth) |
| `/auth/v1/sign-in` | Microsoft-only card (ADR 0004 — no email/password). Carries `?redirect=`; post-OAuth callback returns here, and an existing session is bounced to dashboard / picker / `?redirect=` |
| `/auth/v1/organizations` | **Org picker**: memberships (active badge, `setActive`), pending invitations (accept inline), sign-out |
| `/auth/v1/invites?inviteId=` | Accept/decline card. Not signed in → sign-in with `?redirect=` back (Microsoft sign-in auto-creates the account, ADR 0004) |
| `/dashboard`, `/projects/:id`, `/admin`, `/settings` | Under the `_org` layout (renamed from `_auth`) |
| `/settings` | Org settings — Profile + Members tabs, gated to org `admin`/`owner` via `organization.hasPermission` |
| `/share/:token` | Unchanged — public |

## Decisions

- **Organization required — there is no org-less mode.** The `_org` layout
  gates on session *and* `activeOrganizationId` (openrams shape): no session →
  sign-in; session without active org → picker (with `?redirect=` so the user
  returns to where they were). The previous "org-less users are fully
  functional" state (ADR 0008's interim note) is retired: after the backfill,
  a fresh sign-in is walled at the picker until they accept an invitation.
- **Board links auto-switch org.** Opening `/projects/:id` with a mismatched
  (or missing) active org attempts `setActive` to the Project's org in the
  layout `beforeLoad` (the `trpc.projects.byId` query is shared with the child
  via the query cache). Better-auth verifies membership, so a non-member's
  switch fails and falls back to the picker redirect. Non-project routes with
  a missing/mismatched org go straight to the picker.
- **Invite flow ships.** `sendInvitationEmail` fires the existing `email.send`
  trigger.dev task (ADR 0005) with a new `org-invite` template; `inviteMember`
  keeps better-auth's auto-accept for emails that already have a user, so an
  admin inviting a colleague who already uses the app grants membership
  instantly with no email. Settings → Members gains invite (role:
  member/admin/owner), remove, and pending-invitation revoke
  (`cancelInvitation`). Invitation expiry stays the better-auth default.
- **Org DAC roles** (`packages/auth/src/organization/permissions.ts`):
  stock better-auth `owner`/`admin`/`member` role statements registered on the
  org plugin (`ac` + `roles`). This makes `hasPermission` and the org
  management endpoints enforce the role policy — what makes the `/settings`
  gate and member actions real. No coercion is added (ADR 0008 stands: the
  auth config still grants nothing).
- **No `/home` marketing landing page** (owner decision). Unauthenticated
  traffic lands on the sign-in card directly.
- **No password flow** of any kind (sign-up form, recovery) — Microsoft is the
  only door (ADR 0004).
- **Root plumbing** (inherited from openrams): `__root` fetches the session
  into router context via a server fn, and a client `AuthGate` invalidates the
  router on session change — this is what makes post-OAuth-callback re-routing
  reliable. The older `getUser` server fn / `middleware/auth.ts` pattern is
  deleted. `authClient` gets an explicit SSR `baseURL`
  (`BETTER_AUTH_URL`), `inferAdditionalFields`, and the org client with the
  DAC `ac`/`roles` for typing.
- **Drive-by fix:** `emails/user/welcome.tsx` declared `key: "user-invite"`
  (a copy bug); it is now `user-welcome` so the new invite key cannot collide.

## Consequences

- A user signed in *after* the backfill who has never been invited sees only
  the picker. This is intended: the invite flow is now the only door into the
  org, so the org remains a stable population (staff who stay in the Entra
  tenant but leave the company will not appear as members).
- `project.organizationId` (ADR 0008) is now effectively always stamped,
  since no one reaches project creation without an org. Legacy null-org
  projects are untouched.
- Project *access* is unchanged (Owner/Editor, CONTEXT.md): the org gate is a
  provisioning gate, not an access gate.
- Teams stay off; no billing/plan surfaces; no PostHog.
