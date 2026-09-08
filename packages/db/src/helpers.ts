import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { sql } from "drizzle-orm/sql";
import type { DrizzleDbType } from "./index";
import { project, projectEditor } from "./schema/app";
import { member } from "./schema/auth";

export const countOverSql = sql<number>`CAST(COUNT(*) OVER() AS INTEGER)`;

/**
 * Converts a freshly-created user's Pending Invites into active Editors
 * (see CONTEXT.md — Pending Invite auto-grants on first sign-in), then grants
 * membership of the organizations that own those Projects so the org gate on
 * the project pages lets the new Editor in.
 */
export async function activatePendingInvites(
	db: DrizzleDbType,
	{ userId, email }: { userId: string; email: string },
) {
	const activated = await db
		.update(projectEditor)
		.set({ userId, status: "active" })
		.where(
			and(
				eq(projectEditor.email, email.toLowerCase()),
				eq(projectEditor.status, "pending"),
			),
		)
		.returning({ projectId: projectEditor.projectId });

	await grantOrgMembershipForProjects(
		db,
		userId,
		activated.map((row) => row.projectId),
	);
}

/**
 * Adds the user to the organizations that own the given Projects. The project
 * pages sit behind an org gate (apps/web `_org` route), so an Editor must
 * belong to a Project's org to open it. Skips org-less Projects and orgs the
 * user already belongs to.
 */
export async function grantOrgMembershipForProjects(
	db: DrizzleDbType,
	userId: string,
	projectIds: string[],
) {
	if (projectIds.length === 0) {
		return;
	}

	const projects = await db
		.select({ organizationId: project.organizationId })
		.from(project)
		.where(inArray(project.id, projectIds));

	const orgIds = [
		...new Set(
			projects
				.map((row) => row.organizationId)
				.filter((id): id is string => id !== null),
		),
	];
	if (orgIds.length === 0) {
		return;
	}

	const existing = await db
		.select({ organizationId: member.organizationId })
		.from(member)
		.where(
			and(eq(member.userId, userId), inArray(member.organizationId, orgIds)),
		);
	const alreadyMember = new Set(existing.map((row) => row.organizationId));

	const rows = orgIds
		.filter((orgId) => !alreadyMember.has(orgId))
		.map((organizationId) => ({
			id: randomUUID(),
			organizationId,
			userId,
			role: "member",
			createdAt: new Date(),
		}));

	if (rows.length > 0) {
		await db.insert(member).values(rows);
	}
}
