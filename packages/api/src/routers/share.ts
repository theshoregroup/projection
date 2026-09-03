import { line, project } from "@projection/db/schema/app";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { deriveWindow } from "../domain/dates";
import { applyDerivedGroupDates } from "../domain/groups";
import { publicProcedure, router } from "../index";
import { resolveOrgLogo } from "../lib/org-logo";
import {
	PDF_PAGE_SIZES,
	type PdfPageSize,
	renderBoardPdf,
} from "../pdf/board-pdf";

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
					allowVisitorsToExport: found.allowVisitorsToExport,
				},
				lines,
				window: deriveWindow(lines, found),
			};
		}),

	/** Visitor PDF export — only when the Owner has switched it on for this
	 * Share Link (CONTEXT.md — Share Link; allowVisitorsToExport). */
	exportPdfByToken: publicProcedure
		.input(
			z.object({
				token: z.string().min(1),
				pageSize: z.enum(PDF_PAGE_SIZES).default("A3"),
			}),
		)
		.mutation(async ({ ctx, input }) => {
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
			if (!found.allowVisitorsToExport) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "The owner hasn't enabled PDF export for this link",
				});
			}
			const lines = applyDerivedGroupDates(
				await ctx.db
					.select()
					.from(line)
					.where(eq(line.projectId, found.id))
					.orderBy(asc(line.sortOrder)),
			);
			const orgLogoUrl = await resolveOrgLogo(ctx.db, found.organizationId);
			return renderBoardPdf(found, lines, input.pageSize as PdfPageSize, {
				orgLogoUrl,
			});
		}),
});
