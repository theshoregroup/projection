import type { DrizzleDbType } from "@projection/db";
import { line, project, projectEditor } from "@projection/db/schema/app";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { canManage, type ProjectRole, roleFor } from "../domain/permissions";

/**
 * Loads a Project and the caller's role on it. Invisible projects are
 * reported as NOT_FOUND so existence never leaks (CONTEXT.md — a Project is
 * visible only to its Owner and Editors).
 */
export async function loadProjectForUser(
	db: DrizzleDbType,
	projectId: string,
	userId: string,
) {
	const [found] = await db
		.select()
		.from(project)
		.where(eq(project.id, projectId))
		.limit(1);
	if (!found) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
	}
	const editors = await db
		.select()
		.from(projectEditor)
		.where(eq(projectEditor.projectId, projectId));
	const role = roleFor(userId, found, editors);
	if (!role) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Project not found" });
	}
	return { project: found, editors, role };
}

/** Owner-only: membership, Share Link, deletion (CONTEXT.md — Owner). */
export function assertOwner(role: ProjectRole) {
	if (!canManage(role)) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Only the Owner can do that",
		});
	}
}

export async function loadLineForUser(
	db: DrizzleDbType,
	lineId: string,
	userId: string,
) {
	const [found] = await db
		.select()
		.from(line)
		.where(eq(line.id, lineId))
		.limit(1);
	if (!found) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Line not found" });
	}
	const access = await loadProjectForUser(db, found.projectId, userId);
	return { line: found, ...access };
}
