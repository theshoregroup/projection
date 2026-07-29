import type { AppRouter } from "@projection/api/routers/index";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";
import type { QueryClient } from "@tanstack/react-query";
import type { TRPCClient } from "@trpc/client";
import type { inferRouterOutputs } from "@trpc/server";

// Local-app feel (ADR 0002): TanStack DB collections sync from tRPC, mutations
// apply optimistically and roll back on error. Incoming sync is pull-based —
// refetchInterval below plus focus refetch — never pushed.

type RouterOutputs = inferRouterOutputs<AppRouter>;
export type ProjectRow = RouterOutputs["projects"]["listMine"][number];
export type LineRow = RouterOutputs["lines"]["list"][number];
export type EditorRow = RouterOutputs["sharing"]["listEditors"][number];

/** A Project plus how the signed-in user relates to it. */
export type ProjectsRow = ProjectRow & { relation: "mine" | "shared" };

export const BOARD_REFETCH_INTERVAL = 20_000;

// Sync only in the browser: during SSR the collection renders empty and the
// client starts syncing on hydration.
const START_SYNC = typeof window !== "undefined";

// Collections are memoized per QueryClient (per-request on the server,
// singleton in the browser) so the same query never syncs twice.
const registry = new WeakMap<QueryClient, Map<string, unknown>>();

function memoized<T>(
	queryClient: QueryClient,
	key: string,
	factory: () => T,
): T {
	let byKey = registry.get(queryClient);
	if (!byKey) {
		byKey = new Map();
		registry.set(queryClient, byKey);
	}
	const existing = byKey.get(key);
	if (existing) return existing as T;
	const created = factory();
	byKey.set(key, created);
	return created;
}

// Note on writes: creates go through direct tRPC mutations (we need the
// server-generated id, e.g. to navigate) plus query invalidation, which the
// collection picks up reactively. Row edits and deletes — where ids are
// already known — go through the collection for optimistic local feel.

export function getProjectsCollection(
	queryClient: QueryClient,
	trpc: TRPCClient<AppRouter>,
) {
	return memoized(queryClient, "projects", () =>
		createCollection(
			queryCollectionOptions({
				id: "projects",
				queryKey: ["collection", "projects"],
				queryClient,
				getKey: (row: ProjectsRow) => row.id,
				startSync: START_SYNC,
				refetchInterval: BOARD_REFETCH_INTERVAL,
				queryFn: async (): Promise<ProjectsRow[]> => {
					const [mine, shared] = await Promise.all([
						trpc.projects.listMine.query(),
						trpc.projects.listShared.query(),
					]);
					return [
						...mine.map((proj) => ({ ...proj, relation: "mine" as const })),
						...shared.map((proj) => ({ ...proj, relation: "shared" as const })),
					];
				},
				onUpdate: async ({ transaction }) => {
					for (const mutation of transaction.mutations) {
						await trpc.projects.update.mutate({
							id: mutation.key as string,
							...mutation.changes,
						});
					}
				},
				onDelete: async ({ transaction }) => {
					for (const mutation of transaction.mutations) {
						await trpc.projects.delete.mutate({ id: mutation.key as string });
					}
				},
			}),
		),
	);
}

export function getLinesCollection(
	queryClient: QueryClient,
	trpc: TRPCClient<AppRouter>,
	projectId: string,
) {
	return memoized(queryClient, `lines:${projectId}`, () =>
		createCollection(
			queryCollectionOptions({
				id: `lines-${projectId}`,
				queryKey: ["collection", "lines", projectId],
				queryClient,
				getKey: (row: LineRow) => row.id,
				startSync: START_SYNC,
				refetchInterval: BOARD_REFETCH_INTERVAL,
				queryFn: (): Promise<LineRow[]> => trpc.lines.list.query({ projectId }),
				onInsert: async ({ transaction }) => {
					for (const mutation of transaction.mutations) {
						const row = mutation.modified;
						await trpc.lines.create.mutate({
							projectId: row.projectId,
							item: row.item,
							startDate: row.startDate,
							endDate: row.endDate,
							assignee: row.assignee ?? undefined,
							note: row.note ?? undefined,
							percentComplete: row.percentComplete,
							isMilestone: row.isMilestone,
						});
					}
				},
				onUpdate: async ({ transaction }) => {
					for (const mutation of transaction.mutations) {
						// sortOrder changes persist via the reorder endpoint (direct
						// mutation + invalidation); everything else rides this one.
						const {
							sortOrder: _sortOrder,
							projectId: _projectId,
							createdAt: _createdAt,
							updatedAt: _updatedAt,
							...changes
						} = mutation.changes as Partial<LineRow>;
						if (Object.keys(changes).length > 0) {
							await trpc.lines.update.mutate({
								id: mutation.key as string,
								...changes,
							});
						}
					}
				},
				onDelete: async ({ transaction }) => {
					for (const mutation of transaction.mutations) {
						await trpc.lines.delete.mutate({ id: mutation.key as string });
					}
				},
			}),
		),
	);
}

export function getEditorsCollection(
	queryClient: QueryClient,
	trpc: TRPCClient<AppRouter>,
	projectId: string,
) {
	return memoized(queryClient, `editors:${projectId}`, () =>
		createCollection(
			queryCollectionOptions({
				id: `editors-${projectId}`,
				queryKey: ["collection", "editors", projectId],
				queryClient,
				getKey: (row: EditorRow) => row.id,
				startSync: START_SYNC,
				refetchInterval: BOARD_REFETCH_INTERVAL,
				queryFn: (): Promise<EditorRow[]> =>
					trpc.sharing.listEditors.query({ projectId }),
			}),
		),
	);
}
