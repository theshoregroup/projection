# PlanetScale Postgres + Drizzle

Persistence is PlanetScale Postgres accessed through Drizzle ORM (node `pg` driver), with `DATABASE_URL` as the single connection env var. better-auth's tables live in a dedicated `auth` Postgres schema; application tables live in `public`.

Lock-in to both the provider and the ORM is accepted: the better-auth Drizzle adapter is first-class, Drizzle's type-safe lightness matches the stack, and the provider was provisioned by the owner directly.
