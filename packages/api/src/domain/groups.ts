// Groups (CONTEXT.md): a Group is a Line containing other Lines, linked by
// groupId. Display order is derived — siblings ordered by sortOrder, flattened
// depth-first — so moving a Group moves its whole subtree with one write. A
// Group's Start/End are derived on read (earliest child Start, latest child
// End), so no write path ever has to maintain them; empty Groups keep their
// stored dates.
//
// Everything here is pure and structural: functions take the minimal row
// shape so they can be tested without the database and shared with the web
// app (which already imports domain modules).

import type { IsoDate } from "./dates";

export interface GroupableLine {
	id: string;
	isGroup: boolean;
	groupId: string | null;
	startDate: IsoDate;
	endDate: IsoDate;
	sortOrder: number;
}

/** One visible Board row: a Line plus its nesting depth and parent Group. */
export interface BoardRow<T extends GroupableLine> {
	line: T;
	depth: number;
	/** Id of the parent Group, null at the top level. */
	parentId: string | null;
}

/** The effective parent: a dangling or non-Group groupId means top level. */
function effectiveParentId<T extends GroupableLine>(
	line: T,
	byId: Map<string, T>,
): string | null {
	if (line.groupId === null) return null;
	const parent = byId.get(line.groupId);
	return parent?.isGroup ? line.groupId : null;
}

function childrenMap<T extends GroupableLine>(
	lines: ReadonlyArray<T>,
	byId: Map<string, T>,
): Map<string | null, T[]> {
	const children = new Map<string | null, T[]>();
	for (const line of lines) {
		const parentId = effectiveParentId(line, byId);
		const bucket = children.get(parentId);
		if (bucket) bucket.push(line);
		else children.set(parentId, [line]);
	}
	for (const bucket of children.values()) {
		bucket.sort((a, b) => a.sortOrder - b.sortOrder);
	}
	return children;
}

/**
 * Flattens Lines into Board display order: a depth-first walk with siblings
 * ordered by sortOrder. Orphaned rows (dangling groupId) surface at the top
 * level; cycles are broken by treating an already-visited Group as childless.
 */
export function buildRows<T extends GroupableLine>(
	lines: ReadonlyArray<T>,
): Array<BoardRow<T>> {
	const byId = new Map(lines.map((line) => [line.id, line]));
	const children = childrenMap(lines, byId);
	const rows: Array<BoardRow<T>> = [];
	const visited = new Set<string>();
	const visit = (
		parentId: string | null,
		depth: number,
		seen: ReadonlySet<string>,
	) => {
		for (const line of children.get(parentId) ?? []) {
			if (visited.has(line.id)) continue;
			visited.add(line.id);
			rows.push({ line, depth, parentId });
			if (line.isGroup && !seen.has(line.id)) {
				visit(line.id, depth + 1, new Set(seen).add(line.id));
			}
		}
	};
	visit(null, 0, new Set());
	// Lines unreachable from the top level (a Group cycle) must never vanish
	// from the Board — surface them as top-level rows.
	const lost = lines
		.filter((line) => !visited.has(line.id))
		.sort((a, b) => a.sortOrder - b.sortOrder);
	for (const line of lost) {
		visited.add(line.id);
		rows.push({ line, depth: 0, parentId: null });
	}
	return rows;
}

/** Ids of every Line inside a Group (any depth), cycle-safe. */
export function descendantIds<T extends GroupableLine>(
	lines: ReadonlyArray<T>,
	groupId: string,
): Set<string> {
	const byId = new Map(lines.map((line) => [line.id, line]));
	const children = childrenMap(lines, byId);
	const found = new Set<string>();
	const queue = [groupId];
	while (queue.length > 0) {
		const current = queue.pop() as string;
		for (const child of children.get(current) ?? []) {
			if (found.has(child.id)) continue;
			found.add(child.id);
			queue.push(child.id);
		}
	}
	return found;
}

/** True when `id` sits anywhere inside `ancestorId`'s subtree. */
export function isDescendantOf<T extends GroupableLine>(
	lines: ReadonlyArray<T>,
	ancestorId: string,
	id: string,
): boolean {
	return descendantIds(lines, ancestorId).has(id);
}

/**
 * The selection with redundant rows removed: when both a Group and one of
 * its descendants are selected, the descendant is implied and dropped. Acts
 * on the raw id list, preserving its order.
 */
export function normalizeSelection<T extends GroupableLine>(
	lines: ReadonlyArray<T>,
	ids: ReadonlyArray<string>,
): string[] {
	const byId = new Map(lines.map((line) => [line.id, line]));
	const selected = new Set(ids);
	return ids.filter((id) => {
		const line = byId.get(id);
		if (!line) return false;
		const seen = new Set<string>([id]);
		let parentId = effectiveParentId(line, byId);
		while (parentId !== null && !seen.has(parentId)) {
			if (selected.has(parentId)) return false;
			seen.add(parentId);
			const parent = byId.get(parentId);
			parentId = parent ? effectiveParentId(parent, byId) : null;
		}
		return true;
	});
}

/** The selection plus every descendant of any selected Group. */
export function expandWithDescendants<T extends GroupableLine>(
	lines: ReadonlyArray<T>,
	ids: ReadonlyArray<string>,
): Set<string> {
	const byId = new Map(lines.map((line) => [line.id, line]));
	const expanded = new Set<string>();
	for (const id of ids) {
		expanded.add(id);
		const line = byId.get(id);
		if (line?.isGroup) {
			for (const descendant of descendantIds(lines, id)) {
				expanded.add(descendant);
			}
		}
	}
	return expanded;
}

/**
 * Group rows with their dates derived from their subtree: Start = earliest
 * descendant Start, End = latest descendant End (both recursive, so nested
 * Groups roll up). Empty Groups keep their stored dates. Input order is
 * preserved and non-Group rows pass through untouched.
 */
export function applyDerivedGroupDates<T extends GroupableLine>(
	lines: ReadonlyArray<T>,
): T[] {
	const byId = new Map(lines.map((line) => [line.id, line]));
	const children = childrenMap(lines, byId);
	const memo = new Map<string, { startDate: IsoDate; endDate: IsoDate }>();

	const derive = (
		group: T,
		seen: ReadonlySet<string>,
	): { startDate: IsoDate; endDate: IsoDate } => {
		const cached = memo.get(group.id);
		if (cached) return cached;
		const nextSeen = new Set(seen).add(group.id);
		let startDate: IsoDate | null = null;
		let endDate: IsoDate | null = null;
		for (const child of children.get(group.id) ?? []) {
			if (nextSeen.has(child.id)) continue;
			const range = child.isGroup ? derive(child, nextSeen) : child;
			if (startDate === null || range.startDate < startDate) {
				startDate = range.startDate;
			}
			if (endDate === null || range.endDate > endDate) {
				endDate = range.endDate;
			}
		}
		const range =
			startDate !== null && endDate !== null
				? { startDate, endDate }
				: { startDate: group.startDate, endDate: group.endDate };
		memo.set(group.id, range);
		return range;
	};

	return lines.map((line) =>
		line.isGroup ? { ...line, ...derive(line, new Set()) } : line,
	);
}
