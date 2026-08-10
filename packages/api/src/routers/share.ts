import { line, project } from "@projection/db/schema/app";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { deriveWindow } from "../domain/dates";
import { applyDerivedGroupDates } from "../domain/groups";
import { publicProcedure, router } from "../index";

/** Public, unauthenticated read-only Board via a Share Link token (CONTEXT.md). */
export const shareRouter = router({
	getByToken: publicProcedure
		.input(z.object({ token: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const [found] = await ctx.db
				.select()
				.from(project)
				.where(eq(project.shareToken, input.token))
				.limit(1);
			if (!found) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Share link not found",
				});
			}
			const lines = applyDerivedGroupDates(
				await ctx.db
					.select()
					.from(line)
					.where(eq(line.projectId, found.id))
					.orderBy(asc(line.sortOrder)),
			);
			return {
				project: {
					id: found.id,
					name: found.name,
					description: found.description,
					seedStart: found.seedStart,
					seedEnd: found.seedEnd,
				},
				lines,
				window: deriveWindow(lines, found),
			};
		}),
});
