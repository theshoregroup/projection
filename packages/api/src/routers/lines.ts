import { line } from "@projection/db/schema/app";
import { TRPCError } from "@trpc/server";
import { asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { sortOrderAtEnd, sortOrderBetween } from "../domain/ordering";
import { protectedProcedure, router } from "../index";
import { loadLineForUser, loadProjectForUser } from "../lib/access";
import {
	coerceMilestoneDates,
	lineBaseSchema,
	lineUpdateSchema,
	reorderSchema,
	validLineRange,
} from "../schemas";

export const linesRouter = router({
	list: protectedProcedure
		.input(z.object({ projectId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			await loadProjectForUser(ctx.db, input.projectId, ctx.session.user.id);
			return ctx.db
				.select()
				.from(line)
				.where(eq(line.projectId, input.projectId))
				.orderBy(asc(line.sortOrder));
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
				})
				.transform(coerceMilestoneDates)
				.refine(validLineRange, {
					message: "End must be on or after Start",
					path: ["endDate"],
				}),
		)
		.mutation(async ({ ctx, input }) => {
			await loadProjectForUser(ctx.db, input.projectId, ctx.session.user.id);
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
				const existing = await ctx.db
					.select({ sortOrder: line.sortOrder })
					.from(line)
					.where(eq(line.projectId, input.projectId));
				sortOrder = sortOrderAtEnd(existing.map((row) => row.sortOrder));
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

	reorder: protectedProcedure
		.input(reorderSchema)
		.mutation(async ({ ctx, input }) => {
			await loadProjectForUser(ctx.db, input.projectId, ctx.session.user.id);
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
				.set({ sortOrder })
				.where(eq(line.id, input.lineId))
				.returning();
			return updated;
		}),
});
