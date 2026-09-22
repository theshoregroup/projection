import { randomUUID } from "node:crypto";
import { line, project, projectEditor } from "@projection/db/schema/app";
import { user } from "@projection/db/schema/auth";
import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { addDays, diffDays } from "../domain/dates";
import { duplicateLines } from "../domain/duplicate";
import { applyDerivedGroupDates } from "../domain/groups";
import { protectedProcedure, router } from "../index";
import {
	assertOwner,
	findUserOrganizationId,
	loadProjectForUser,
} from "../lib/access";
import { resolveOrgLogo } from "../lib/org-logo";
// Only the page-size vocabulary is imported statically — the renderer
// (pdf-lib) is lazy-loaded inside exportPdf so it never weighs down, or
// breaks, unrelated requests.
import { PDF_PAGE_SIZES, type PdfPageSize } from "../pdf/layout";
import {
	projectCreateSchema,
	projectDuplicateSchema,
	projectUpdateSchema,
} from "../schemas";

const exportPdfInput = z.object({
	id: z.uuid(),
	pageSize: z.enum(PDF_PAGE_SIZES).default("A3"),
});

export const projectsRouter = router({
	create: protectedProcedure
		.input(projectCreateSchema)
		.mutation(async ({ ctx, input }) => {
			// Projects carry their Owner's org (ADR 0008); null while the Owner
			// has no membership
			const organizationId = await findUserOrganizationId(
				ctx.db,
				ctx.session.user.id,
			);
			const [created] = await ctx.db
				.insert(project)
				.values({
					ownerId: ctx.session.user.id,
					organizationId,
					name: input.name,
					description: input.description ?? null,
					seedStart: input.seedStart,
					seedEnd: input.seedEnd,
					colorPalette: input.colorPalette,
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
					colorPalette: input.colorPalette ?? access.project.colorPalette,
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

	/** Forks a Project into a new one the caller owns: same Lines (groupId
	 * references remapped to fresh ids), but a fresh Share Link token and no
	 * Editors — sharing never crosses a duplicate. When `newStartDate` is
	 * provided, all line dates are shifted by the day offset between the
	 * original project's seedStart and the new date. */
	duplicate: protectedProcedure
		.input(projectDuplicateSchema)
		.mutation(async ({ ctx, input }) => {
			const access = await loadProjectForUser(
				ctx.db,
				input.id,
				ctx.session.user.id,
			);
			assertOwner(access.role);
			const dayOffset = input.newStartDate
				? diffDays(access.project.seedStart, input.newStartDate)
				: 0;
			const lines = await ctx.db
				.select()
				.from(line)
				.where(eq(line.projectId, input.id))
				.orderBy(asc(line.sortOrder));

			return ctx.db.transaction(async (tx) => {
				const [created] = await tx
					.insert(project)
					.values({
						ownerId: ctx.session.user.id,
						organizationId: access.project.organizationId,
						name: input.name ?? `${access.project.name} (copy)`,
						description: access.project.description,
						seedStart:
							dayOffset !== 0
								? addDays(access.project.seedStart, dayOffset)
								: access.project.seedStart,
						seedEnd:
							dayOffset !== 0
								? addDays(access.project.seedEnd, dayOffset)
								: access.project.seedEnd,
						colorPalette: access.project.colorPalette,
						shareToken: randomUUID(),
					})
					.returning();
				if (!created) {
					throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
				}
				const copied = duplicateLines(lines, created.id, { dayOffset });
				if (copied.length > 0) {
					await tx.insert(line).values(copied);
				}
				return created;
			});
		}),

	byId: protectedProcedure
		.input(z.object({ id: z.uuid() }))
		.query(async ({ ctx, input }) => {
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
			.select({
				project,
				editorStatus: projectEditor.status,
				ownerName: user.name,
			})
			.from(projectEditor)
			.innerJoin(project, eq(projectEditor.projectId, project.id))
			.innerJoin(user, eq(project.ownerId, user.id))
			.where(eq(projectEditor.userId, ctx.session.user.id))
			.orderBy(asc(project.name));
		return rows
			.filter((row) => row.editorStatus === "active")
			.map((row) => ({ ...row.project, ownerName: row.ownerName }));
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
			const orgLogoUrl = await resolveOrgLogo(
				ctx.db,
				access.project.organizationId,
			);
			const { renderBoardPdf } = await import("../pdf/render");
			return renderBoardPdf(
				access.project,
				lines,
				input.pageSize as PdfPageSize,
				{ orgLogoUrl },
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
