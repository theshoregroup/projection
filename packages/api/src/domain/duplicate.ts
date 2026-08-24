/** Shapes for forking a Project's Lines into a new Project (CONTEXT.md —
 * Project, Line, Group). Pure so the groupId remap is unit-testable without
 * a database; the router only supplies ids and persistence. */

export interface DuplicatableLine {
	id: string;
	item: string;
	startDate: string;
	endDate: string;
	assignee: string | null;
	note: string | null;
	percentComplete: number;
	isMilestone: boolean;
	isGroup: boolean;
	groupId: string | null;
	sortOrder: number;
}

export type DuplicatedLine = Omit<DuplicatableLine, "groupId"> & {
	projectId: string;
	groupId: string | null;
};

/** Copies Lines onto a new Project id. Every Line gets a fresh id (from
 * `newId`, defaulting to crypto.randomUUID) and groupId references are
 * remapped through the same id map, so a Group's children still point at
 * the copied Group — never at the source Project's rows. */
export function duplicateLines(
	lines: DuplicatableLine[],
	newProjectId: string,
	// Wrapped: crypto.randomUUID must be called with `crypto` as its receiver
	newId: () => string = () => crypto.randomUUID(),
): DuplicatedLine[] {
	const idMap = new Map(lines.map((l) => [l.id, newId()]));
	return lines.map((l) => ({
		// biome-ignore lint/style/noNonNullAssertion: idMap is built from exactly these ids
		id: idMap.get(l.id)!,
		projectId: newProjectId,
		item: l.item,
		startDate: l.startDate,
		endDate: l.endDate,
		assignee: l.assignee,
		note: l.note,
		percentComplete: l.percentComplete,
		isMilestone: l.isMilestone,
		isGroup: l.isGroup,
		groupId: l.groupId ? (idMap.get(l.groupId) ?? null) : null,
		sortOrder: l.sortOrder,
	}));
}
