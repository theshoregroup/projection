# Auth: Microsoft-only single tenant, admin plugin, no organizations

> **Superseded in part by [ADR 0008](./0008-organizations-single-org.md)** — the organization plugin is now present, scoped to a single company org. Existing users are moved into it by a one-off backfill (the auth config itself grants nothing); the Microsoft-only single-tenant sign-in and the admin-plugin user management described below are unchanged.

Sign-in is exclusively Microsoft OAuth against a single Microsoft Entra tenant, with open signup inside that tenant; email/password is removed entirely. Cross-project access is per-project Owner/Editor grants, so the better-auth organization plugin is deliberately absent — the **admin** plugin is used instead, strictly for user management (list/ban/delete users, grant admin), with the first admins bootstrapped from the `ADMIN_EMAILS` env var.

This combination surprises readers (admin plugin without organizations), so the reasoning is recorded: tenancy is handled by Entra itself, sharing is per-project by design, and admins get **no** access to project contents — preserving the "only Owner + Editors can view" privacy promise.

## Consequences

- Pending Invites auto-grant on first sign-in because Microsoft verifies the email address.
- Removing the email/password flow also removes the need for verify-email/password-reset templates (welcome + invite emails remain, sent via trigger.dev per ADR 0005).
