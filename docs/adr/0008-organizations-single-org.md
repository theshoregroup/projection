# Organizations: one company org, granted by backfill

The better-auth **organization** plugin is added with exactly one organization — **The Shore Group** (`theshoregroup`). Users cannot create organizations (`allowUserToCreateOrganization: false`) and the org cannot be deleted (`disableOrganizationDeletion: true`). The `member` and `invitation` tables FK to the org with `ON DELETE CASCADE`, so deleting the single shared org would wipe every membership and invitation; `session.activeOrganizationId` is a plain nullable column (no FK). Deletion is off to protect the one-org invariant. `membershipLimit` is a constant 10 000. Teams and dynamic access control stay off, and org invitation emails are not wired up yet.

This supersedes ADR 0004's "organization plugin is deliberately absent" — the Microsoft-only single-tenant sign-in is unchanged (it is the *only* way in), and org membership becomes the container that future cross-user features (shared search, billing, org-scoped admin) attach to.

## No coercion — the backfill is the only grant

The auth config deliberately does **not** assign users to the org (no auto-join on sign-in, no auto-set of the active org). Membership is granted exclusively by a one-off, uncommitted backfill script, which:

1. Creates the org (find-by-slug first, so re-runs are safe).
2. Makes every existing user a member — `admin` for the instance admins in `ADMIN_EMAILS`, `member` for everyone else.
3. Points every session without an active org at the org, so live sessions become org-aware without a re-login.
4. Stamps every Project with the org.

Consequence: a user who signs in *after* the backfill has run is **not** in the org until they accept an invitation. (Originally the invitation flow was deferred; it now ships per [ADR 0009](./0009-auth-flow-and-org-provisioning.md), which requires an organization to use the app — a freshly signed-in, uninvited user is walled at the organization picker.) The client registers `organizationClient()`; the picker / dashboard / settings UI ships with ADR 0009.

## Consequences

- `packages/db/src/schema/auth.ts` gains `organization` / `member` / `invitation` tables and `session.active_organization_id`; `project` gains a nullable `organization_id` (FK `ON DELETE SET NULL`).
- `project.create` stamps the Owner's org by **reading** their `member` row (null when they have none); `project.duplicate` copies the source's value. Org membership still changes **nothing** about Project access — Owner/Editor grants are untouched (CONTEXT.md) and admins still see no project contents.
- **Shipped in ADR 0009** (originally deferred here): the plugin's standard invitation flow (`sendInvitationEmail` via trigger.dev + accept page) is the *only* way new users join the org — this became required, not just desirable, since the config no longer auto-joins.
