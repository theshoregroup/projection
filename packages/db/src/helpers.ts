import { and, eq } from "drizzle-orm";
import { sql } from "drizzle-orm/sql";
import type { DrizzleDbType } from "./index";
import { projectEditor } from "./schema/app";

export const countOverSql = sql<number>`CAST(COUNT(*) OVER() AS INTEGER)`;

/**
 * Converts a freshly-created user's Pending Invites into active Editors
 * (see CONTEXT.md — Pending Invite auto-grants on first sign-in).
 */
export async function activatePendingInvites(
	db: DrizzleDbType,
	{ userId, email }: { userId: string; email: string },
) {
	await db
		.update(projectEditor)
		.set({ userId, status: "active" })
		.where(
			and(
				eq(projectEditor.email, email.toLowerCase()),
				eq(projectEditor.status, "pending"),
			),
		);
}
