import { randomUUID } from "node:crypto";
import { line, project, projectEditor } from "@projection/db/schema/app";
import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { applyDerivedGroupDates } from "../domain/groups";
import { protectedProcedure, router } from "../index";
import { assertOwner, loadProjectForUser } from "../lib/access";
import {
	PDF_PAGE_SIZES,
	type PdfPageSize,
	renderBoardPdf,
} from "../pdf/board-pdf";
import { projectCreateSchema, projectUpdateSchema } from "../schemas";

const exportPdfInput = z.object({
	id: z.uuid(),
	pageSize: z.enum(PDF_PAGE_SIZES).default("A3"),
});

export const projectsRouter = router({
	create: protectedProcedure
		.input(projectCreateSchema)
		.mutation(async ({ ctx, input }) => {
			const [created] = await ctx.db
				.insert(project)
				.values({
					ownerId: ctx.session.user.id,
					name: input.name,
					description: input.description ?? null,
					seedStart: input.seedStart,
					seedEnd: input.seedEnd,
					shareToken: randomUUID(),
				})
				.returning();
			return created;
		}),

	update: protectedProcedure
		.input(projectUpdateSchema)
		.mutation(async ({ ctx, input }) => {
			const access = await loadProjectForUser(
				ctx.db,
				input.id,
				ctx.session.user.id,
			);
			// The visitor-export flag is an Owner power (CONTEXT.md — Owner);
			// Editors may still rename and reseed through this same mutation.
			if (input.allowVisitorsToExport !== undefined) {
				assertOwner(access.role);
			}
			const nextSeedStart = input.seedStart ?? access.project.seedStart;
			const nextSeedEnd = input.seedEnd ?? access.project.seedEnd;
			if (nextSeedStart > nextSeedEnd) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "End must be on or after Start",
				});
			}
			const [updated] = await ctx.db
				.update(project)
				.set({
					name: input.name ?? access.project.name,
					description:
						input.description === undefined
							? access.project.description
							: input.description,
					seedStart: nextSeedStart,
					seedEnd: nextSeedEnd,
					allowVisitorsToExport:
						input.allowVisitorsToExport ?? access.project.allowVisitorsToExport,
				})
				.where(eq(project.id, input.id))
				.returning();
			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const access = await loadProjectForUser(
				ctx.db,
				input.id,
				ctx.session.user.id,
			);
			assertOwner(access.role);
			await ctx.db.delete(project).where(eq(project.id, input.id));
			return { id: input.id };
		}),

	byId: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.query(async ({ ctx, input }) => {
			console.log("HERE", input.id, ctx.session.user.id);

			const access = await loadProjectForUser(
				ctx.db,
				input.id,
				ctx.session.user.id,
			);
			return { project: access.project, role: access.role };
		}),

	listMine: protectedProcedure.query(async ({ ctx }) => {
		return ctx.db
			.select()
			.from(project)
			.where(eq(project.ownerId, ctx.session.user.id))
			.orderBy(desc(project.updatedAt));
	}),

	listShared: protectedProcedure.query(async ({ ctx }) => {
		const rows = await ctx.db
			.select({ project, editorStatus: projectEditor.status })
			.from(projectEditor)
			.innerJoin(project, eq(projectEditor.projectId, project.id))
			.where(eq(projectEditor.userId, ctx.session.user.id))
			.orderBy(asc(project.name));
		return rows
			.filter((row) => row.editorStatus === "active")
			.map((row) => row.project);
	}),

	/** PDF export for the Project's members (Owner + Editor); the visitor
	 * variant lives on the share router (CONTEXT.md — Share Link). */
	exportPdf: protectedProcedure
		.input(exportPdfInput)
		.mutation(async ({ ctx, input }) => {
			const access = await loadProjectForUser(
				ctx.db,
				input.id,
				ctx.session.user.id,
			);
			const lines = applyDerivedGroupDates(
				await ctx.db
					.select()
					.from(line)
					.where(eq(line.projectId, input.id))
					.orderBy(asc(line.sortOrder)),
			);
			return renderBoardPdf(
				access.project,
				lines,
				input.pageSize as PdfPageSize,
			);
		}),

	regenerateShareToken: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.mutation(async ({ ctx, input }) => {
			const access = await loadProjectForUser(
				ctx.db,
				input.id,
				ctx.session.user.id,
			);
			assertOwner(access.role);
			const shareToken = randomUUID();
			await ctx.db
				.update(project)
				.set({ shareToken })
				.where(eq(project.id, input.id));
			return { shareToken };
		}),
});
