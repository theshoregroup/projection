// Access rules (CONTEXT.md): a Project is visible only to its Owner and its
// active Editors. Admins get no special access (ADR 0004).

export type ProjectRole = "owner" | "editor";

export function roleFor(
	userId: string,
	project: { ownerId: string },
	editors: ReadonlyArray<{ userId: string | null; status: string }>,
): ProjectRole | null {
	if (project.ownerId === userId) return "owner";
	if (
		editors.some(
			(editor) => editor.userId === userId && editor.status === "active",
		)
	) {
		return "editor";
	}
	return null;
}

/** Content powers: lines, project name and seed dates. */
export const canEdit = (role: ProjectRole): boolean =>
	role === "owner" || role === "editor";

/** Membership, Share Link and deletion powers — Owner only. */
export const canManage = (role: ProjectRole): boolean => role === "owner";
