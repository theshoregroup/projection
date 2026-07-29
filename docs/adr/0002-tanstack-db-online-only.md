# Local-app feel via TanStack DB over tRPC; offline-first deferred

"Feels like a local app" is a core tenet of the product. v1 achieves it with TanStack DB `queryCollection`s synced from the tRPC API: mutations apply optimistically to local collections with rollback on error, live-queries make UI reactive across components, and incoming sync is pull-based (refetch on focus/invalidation plus a ~20s poll while a Board is open).

True offline-first — a persisted local database plus push sync via Electric — is explicitly **deferred**: it requires hosting a sync service and Postgres logical replication that is unverified on PlanetScale Postgres, plus conflict-resolution semantics, which would sink v1 scope.

## Consequences

- Online-only: without connectivity the app is at best read-only from cache.
- Concurrent edits are last-write-wins at the server; there are no presence indicators or live cursors.
- The upgrade path is swapping collection sync engines to `electricCollection`; mutation handlers and live-queries survive that swap, which is why this deferral is cheap to reverse later.
