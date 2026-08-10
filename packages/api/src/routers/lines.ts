import { randomUUID } from "node:crypto";
import { line } from "@projection/db/schema/app";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import {
	applyDerivedGroupDates,
	buildRows,
	descendantIds,
	expandWithDescendants,
	normalizeSelection,
} from "../domain/groups";
import { sortOrderAtEnd, sortOrderBetween } from "../domain/ordering";
import { protectedProcedure, router } from "../index";
import { loadLineForUser, loadProjectForUser } from "../lib/access";
import {
	coerceMilestoneDates,
	groupSchema,
	lineBaseSchema,
	lineIdsSchema,
	lineUpdateSchema,
	reorderSchema,
	validLineRange,
} from "../schemas";

type LineRow = typeof line.$inferSelect;

/** All Lines of the Project, ordered for the Board (groups not yet derived). */
async function loadProjectLines(
	db: Parameters<typeof loadProjectForUser>[0],
	projectId: string,
): Promise<LineRow[]> {
	return db
		.select()
		.from(line)
		.where(eq(line.projectId, projectId))
		.orderBy(asc(line.sortOrder));
}

/** Every id in `ids` must be a Line of this Project. */
async function assertLinesInProject(
	db: Parameters<typeof loadProjectForUser>[0],
	projectId: string,
	ids: ReadonlyArray<string>,
): Promise<LineRow[]> {
	const rows = await db
		.select()
		.from(line)
		.where(and(eq(line.projectId, projectId), inArray(line.id, [...ids])));
	if (rows.length !== new Set(ids).size) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Some lines were not found in this project",
		});
	}
	return rows;
}

/** The Group must be a group row of this Project and not inside `lineId`'s
 * own subtree (which would create a cycle). */
function assertValidGroupTarget(
	lines: LineRow[],
	groupId: string,
	movedLineId?: string,
): void {
	const target = lines.find((row) => row.id === groupId);
	if (!target?.isGroup) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Target group not found",
		});
	}
	if (
		movedLineId !== undefined &&
		(movedLineId === groupId || descendantIds(lines, movedLineId).has(groupId))
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "A group cannot be moved into itself",
		});
	}
}

export const linesRouter = router({
	list: protectedProcedure
		.input(z.object({ projectId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			await loadProjectForUser(ctx.db, input.projectId, ctx.session.user.id);
			const lines = await loadProjectLines(ctx.db, input.projectId);
			return applyDerivedGroupDates(lines);
		}),

	create: protectedProcedure
		.input(
			lineBaseSchema
				.extend({
					projectId: z.string().min(1),
					// Optional neighbours to insert between (inline creation);
					// omitted means append at the end.
					beforeLineId: z.string().min(1).nullish(),
					afterLineId: z.string().min(1).nullish(),
					// Parent Group for inline creation inside a Group (omitted =
					// top level).
					groupId: z.string().min(1).nullish(),
				})
				.transform(coerceMilestoneDates)
				.refine(validLineRange, {
					message: "End must be on or after Start",
					path: ["endDate"],
				}),
		)
		.mutation(async ({ ctx, input }) => {
			await loadProjectForUser(ctx.db, input.projectId, ctx.session.user.id);
			const groupId = input.groupId ?? null;
			if (groupId !== null) {
				assertValidGroupTarget(
					await loadProjectLines(ctx.db, input.projectId),
					groupId,
				);
			}
			let sortOrder: number;
			if (input.beforeLineId || input.afterLineId) {
				const neighbourIds = [input.beforeLineId, input.afterLineId].filter(
					(id): id is string => id != null,
				);
				const neighbours = await ctx.db
					.select({ id: line.id, sortOrder: line.sortOrder })
					.from(line)
					.where(inArray(line.id, neighbourIds));
				const before =
					neighbours.find((row) => row.id === input.beforeLineId)?.sortOrder ??
					null;
				const after =
					neighbours.find((row) => row.id === input.afterLineId)?.sortOrder ??
					null;
				sortOrder = sortOrderBetween(before, after);
			} else {
				const siblings = await ctx.db
					.select({ sortOrder: line.sortOrder })
					.from(line)
					.where(
						groupId === null
							? and(eq(line.projectId, input.projectId), isNull(line.groupId))
							: eq(line.groupId, groupId),
					);
				sortOrder = sortOrderAtEnd(siblings.map((row) => row.sortOrder));
			}
			const [created] = await ctx.db
				.insert(line)
				.values({
					projectId: input.projectId,
					item: input.item,
					startDate: input.startDate,
					endDate: input.endDate,
					assignee: input.assignee || null,
					note: input.note || null,
					percentComplete: input.percentComplete,
					isMilestone: input.isMilestone,
					groupId,
					sortOrder,
				})
				.returning();
			return created;
		}),

	update: protectedProcedure
		.input(lineUpdateSchema)
		.mutation(async ({ ctx, input }) => {
			const { line: current } = await loadLineForUser(
				ctx.db,
				input.id,
				ctx.session.user.id,
			);
			if (
				current.isGroup &&
				(input.startDate !== undefined ||
					input.endDate !== undefined ||
					input.isMilestone !== undefined ||
					input.percentComplete !== undefined)
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"A group's dates are derived from its lines and can't be edited",
				});
			}
			const merged = {
				item: input.item ?? current.item,
				startDate: input.startDate ?? current.startDate,
				endDate: input.endDate ?? current.endDate,
				assignee:
					input.assignee === undefined
						? current.assignee
						: input.assignee || null,
				note: input.note === undefined ? current.note : input.note || null,
				percentComplete: input.percentComplete ?? current.percentComplete,
				isMilestone: input.isMilestone ?? current.isMilestone,
			};
			// A Milestone occupies a single day (CONTEXT.md)
			if (merged.isMilestone) merged.endDate = merged.startDate;
			if (merged.startDate > merged.endDate) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "End must be on or after Start",
				});
			}
			const [updated] = await ctx.db
				.update(line)
				.set(merged)
				.where(eq(line.id, input.id))
				.returning();
			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			await loadLineForUser(ctx.db, input.id, ctx.session.user.id);
			await ctx.db.delete(line).where(eq(line.id, input.id));
			return { id: input.id };
		}),

	/** Bulk delete (Board selection). Deleting a Group deletes its whole
	 * subtree (CONTEXT.md); the DB cascade covers any depth. */
	deleteMany: protectedProcedure
		.input(lineIdsSchema)
		.mutation(async ({ ctx, input }) => {
			await loadProjectForUser(ctx.db, input.projectId, ctx.session.user.id);
			const rows = await assertLinesInProject(
				ctx.db,
				input.projectId,
				input.ids,
			);
			const all = await loadProjectLines(ctx.db, input.projectId);
			const expanded = expandWithDescendants(
				all,
				rows.map((row) => row.id),
			);
			await ctx.db
				.delete(line)
				.where(
					and(
						eq(line.projectId, input.projectId),
						inArray(line.id, [...expanded]),
					),
				);
			return { ids: [...expanded] };
		}),

	/** Group the selection: a new Group row takes the topmost selected row's
	 * place and parent; the selection (normalized — a selected Group already
	 * implies its descendants) moves underneath it. */
	group: protectedProcedure
		.input(groupSchema)
		.mutation(async ({ ctx, input }) => {
			await loadProjectForUser(ctx.db, input.projectId, ctx.session.user.id);
			const all = await loadProjectLines(ctx.db, input.projectId);
			const allIds = new Set(all.map((row) => row.id));
			const missing = input.lineIds.filter((id) => !allIds.has(id));
			if (missing.length > 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Some lines were not found in this project",
				});
			}
			const ids = normalizeSelection(all, input.lineIds);
			const rows = buildRows(all);
			const topmost = rows.find((row) => ids.includes(row.line.id));
			if (!topmost) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Nothing to group",
				});
			}
			// Stored dates are only a fallback for if the Group ever empties;
			// while it has children its dates are derived on read.
			const span = {
				startDate: topmost.line.startDate,
				endDate: topmost.line.endDate,
			};
			for (const row of rows) {
				if (!ids.includes(row.line.id)) continue;
				if (row.line.startDate < span.startDate)
					span.startDate = row.line.startDate;
				if (row.line.endDate > span.endDate) span.endDate = row.line.endDate;
			}
			// The Group sits where the topmost selected row was.
			const siblings = rows.filter((row) => row.parentId === topmost.parentId);
			const index = siblings.findIndex(
				(row) => row.line.id === topmost.line.id,
			);
			const before = siblings[index - 1]?.line.sortOrder ?? null;
			const after = topmost.line.sortOrder;
			const [created] = await ctx.db
				.insert(line)
				.values({
					projectId: input.projectId,
					item: "New group",
					startDate: span.startDate,
					endDate: span.endDate,
					isGroup: true,
					groupId: topmost.parentId,
					sortOrder: sortOrderBetween(before, after),
				})
				.returning();
			if (!created) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Couldn't create the group",
				});
			}
			await ctx.db
				.update(line)
				.set({ groupId: created.id })
				.where(inArray(line.id, ids));
			return applyDerivedGroupDates([...all, created]).find(
				(row) => row.id === created.id,
			) as LineRow;
		}),

	/** Duplicate the selection as the next siblings of their sources (the
	 * Board's Copy). Groups deep-copy their subtrees; top-level copies get
	 * " (copy)" appended to the Item. */
	duplicateMany: protectedProcedure
		.input(lineIdsSchema)
		.mutation(async ({ ctx, input }) => {
			await loadProjectForUser(ctx.db, input.projectId, ctx.session.user.id);
			const all = await loadProjectLines(ctx.db, input.projectId);
			const allIds = new Set(all.map((row) => row.id));
			const missing = input.ids.filter((id) => !allIds.has(id));
			if (missing.length > 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Some lines were not found in this project",
				});
			}
			const ids = normalizeSelection(all, input.ids);
			const rows = buildRows(all);
			const inserts: Array<typeof line.$inferInsert> = [];
			const newIds: string[] = [];
			for (const id of ids) {
				const source = all.find((row) => row.id === id) as LineRow;
				const sourceRow = rows.find((row) => row.line.id === id);
				const siblings = rows.filter(
					(row) => row.parentId === sourceRow?.parentId,
				);
				const index = siblings.findIndex((row) => row.line.id === id);
				const next = siblings[index + 1]?.line.sortOrder ?? null;
				const copyId = randomUUID();
				newIds.push(copyId);
				inserts.push({
					id: copyId,
					projectId: source.projectId,
					item: `${source.item} (copy)`,
					startDate: source.startDate,
					endDate: source.endDate,
					assignee: source.assignee,
					note: source.note,
					percentComplete: source.percentComplete,
					isMilestone: source.isMilestone,
					isGroup: source.isGroup,
					groupId: sourceRow?.parentId ?? null,
					sortOrder: sortOrderBetween(source.sortOrder, next),
				});
				if (!source.isGroup) continue;
				// Deep-copy the subtree; children keep their relative order and
				// only their groupId re-points at the new ids.
				const descendants = rows.filter(
					(row) =>
						row.line.id !== id && descendantIds(all, id).has(row.line.id),
				);
				const idMap = new Map<string, string>([[id, copyId]]);
				for (const row of descendants) {
					idMap.set(row.line.id, randomUUID());
				}
				for (const row of descendants) {
					const newId = idMap.get(row.line.id) as string;
					newIds.push(newId);
					inserts.push({
						id: newId,
						projectId: row.line.projectId,
						item: row.line.item,
						startDate: row.line.startDate,
						endDate: row.line.endDate,
						assignee: row.line.assignee,
						note: row.line.note,
						percentComplete: row.line.percentComplete,
						isMilestone: row.line.isMilestone,
						isGroup: row.line.isGroup,
						groupId: idMap.get(row.parentId ?? "") ?? row.parentId,
						sortOrder: row.line.sortOrder,
					});
				}
			}
			if (inserts.length > 0) await ctx.db.insert(line).values(inserts);
			return { ids: newIds };
		}),

	reorder: protectedProcedure
		.input(reorderSchema)
		.mutation(async ({ ctx, input }) => {
			await loadProjectForUser(ctx.db, input.projectId, ctx.session.user.id);
			const all = await loadProjectLines(ctx.db, input.projectId);
			const moved = all.find((row) => row.id === input.lineId);
			if (!moved) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Line not found" });
			}
			if (input.groupId !== null) {
				assertValidGroupTarget(all, input.groupId, input.lineId);
			}
			const neighbourIds = [input.beforeLineId, input.afterLineId].filter(
				(id): id is string => id !== null,
			);
			const neighbours = neighbourIds.length
				? await ctx.db
						.select({ id: line.id, sortOrder: line.sortOrder })
						.from(line)
						.where(inArray(line.id, neighbourIds))
				: [];
			const before =
				neighbours.find((row) => row.id === input.beforeLineId)?.sortOrder ??
				null;
			const after =
				neighbours.find((row) => row.id === input.afterLineId)?.sortOrder ??
				null;
			const sortOrder = sortOrderBetween(before, after);
			const [updated] = await ctx.db
				.update(line)
				.set({ sortOrder, groupId: input.groupId })
				.where(eq(line.id, input.lineId))
				.returning();
			return updated;
		}),
});
