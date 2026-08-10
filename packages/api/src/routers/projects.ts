import { randomUUID } from "node:crypto";
import { project, projectEditor } from "@projection/db/schema/app";
import { TRPCError } from "@trpc/server";
import { asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";
import { assertOwner, loadProjectForUser } from "../lib/access";
import { projectCreateSchema, projectUpdateSchema } from "../schemas";

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
