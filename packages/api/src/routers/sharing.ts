import { projectEditor } from "@projection/db/schema/app";
import { user } from "@projection/db/schema/auth";
import { env } from "@projection/env/server";
import { tasks } from "@projection/tasks";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "../index";
import { assertOwner, loadProjectForUser } from "../lib/access";
import { inviteSchema } from "../schemas";

export const sharingRouter = router({
	listEditors: protectedProcedure
		.input(z.object({ projectId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			await loadProjectForUser(ctx.db, input.projectId, ctx.session.user.id);
			return ctx.db
				.select()
				.from(projectEditor)
				.where(eq(projectEditor.projectId, input.projectId));
		}),

	/**
	 * Grants Editor access by email (CONTEXT.md): an existing user becomes an
	 * active Editor immediately; an unknown email becomes a Pending Invite and
	 * is emailed (email send wired in Phase 6 via trigger.dev, ADR 0005).
	 */
	invite: protectedProcedure
		.input(inviteSchema)
		.mutation(async ({ ctx, input }) => {
			const access = await loadProjectForUser(
				ctx.db,
				input.projectId,
				ctx.session.user.id,
			);
			assertOwner(access.role);
			const email = input.email.trim().toLowerCase();

			if (email === ctx.session.user.email.toLowerCase()) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "You already own this Project",
				});
			}
			if (access.editors.some((editor) => editor.email === email)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: "That person already has access",
				});
			}

			const [existingUser] = await ctx.db
				.select({ id: user.id })
				.from(user)
				.where(eq(user.email, email))
				.limit(1);

			const [created] = await ctx.db
				.insert(projectEditor)
				.values({
					projectId: input.projectId,
					userId: existingUser?.id ?? null,
					email,
					status: existingUser ? "active" : "pending",
				})
				.returning();

			if (!existingUser) {
				// Pending Invite — email them via trigger.dev (ADR 0005). The invite
				// row is the source of truth, so a failed send never fails the invite.
				try {
					await tasks.trigger("email.send", {
						from: "Accounts <accounts@projection.com>",
						to: email,
						subject: `${ctx.session.user.name} invited you to edit “${access.project.name}” on projection`,
						props: {
							key: "project-invite",
							data: {
								inviterName: ctx.session.user.name,
								projectName: access.project.name,
								signInUrl: env.BETTER_AUTH_URL,
							},
						},
					});
				} catch (error) {
					console.warn(
						"[sharing.invite] invite email failed to trigger",
						error,
					);
				}
			}

			return { editor: created, inviteSent: !existingUser };
		}),

	/** Removes an Editor or revokes a Pending Invite — Owner only. */
	removeEditor: protectedProcedure
		.input(z.object({ editorId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const [editor] = await ctx.db
				.select()
				.from(projectEditor)
				.where(eq(projectEditor.id, input.editorId))
				.limit(1);
			if (!editor) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Editor not found" });
			}
			const access = await loadProjectForUser(
				ctx.db,
				editor.projectId,
				ctx.session.user.id,
			);
			assertOwner(access.role);
			await ctx.db
				.delete(projectEditor)
				.where(
					and(
						eq(projectEditor.id, input.editorId),
						eq(projectEditor.projectId, editor.projectId),
					),
				);
			return { id: input.editorId };
		}),
});
