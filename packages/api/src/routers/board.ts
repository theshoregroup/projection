import { line } from "@projection/db/schema/app";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { deriveWindow } from "../domain/dates";
import { protectedProcedure, router } from "../index";
import { loadProjectForUser } from "../lib/access";

/** One-shot payload for the Board: project, lines, editors, role, window. */
export const boardRouter = router({
	get: protectedProcedure
		.input(z.object({ projectId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const access = await loadProjectForUser(
				ctx.db,
				input.projectId,
				ctx.session.user.id,
			);
			const lines = await ctx.db
				.select()
				.from(line)
				.where(eq(line.projectId, input.projectId))
				.orderBy(asc(line.sortOrder));
			return {
				project: access.project,
				lines,
				editors: access.editors,
				role: access.role,
				window: deriveWindow(lines, access.project),
			};
		}),
});
