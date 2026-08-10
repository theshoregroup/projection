/** Row-reorder math for the Board: where a dragged Line lands. The
 * insertion-line highlight and the drop itself both derive from the same
 * gap, so the visual can never disagree with the result.
 *
 * Rows are the Board's visible rows (buildRows in domain/groups): a flat
 * depth-first list where Groups nest. A drop resolves to a parent Group plus
 * sibling neighbours — vertical position picks the gap, horizontal position
 * (the depth hint) picks the nesting level, which is how a row drags around
 * in a Group, out of it, or into it. */

import type { BoardRow, GroupableLine } from "@projection/api/domain/groups";

/** Synthetic dragged id for a row that doesn't exist yet (inline creation):
 * absent from `rows`, so the gap converts with no adjustment. */
export const NEW_ROW_ID = "__new__";

/** The border (gap) a dragged row hovers, in displayed row coordinates:
 * 0 = above the first row, lines.length = below the last. Hovering a row
 * below the dragged one inserts *after* it; at or above it, *before* it. */
export function insertionGap(
	lines: ReadonlyArray<{ id: string }>,
	lineId: string,
	targetIndex: number,
): number {
	const current = lines.findIndex((line) => line.id === lineId);
	return targetIndex > current ? targetIndex + 1 : targetIndex;
}

/** Where a drop lands: the parent Group, the sibling neighbours the row
 * slots between, and the resolved depth (drives the highlight's inset). */
export interface DropTarget {
	groupId: string | null;
	beforeId: string | null;
	afterId: string | null;
	depth: number;
}

/**
 * Resolves a hovered gap plus a horizontal depth hint into a DropTarget.
 *
 * A gap's valid depths are constrained so the dropped row displays exactly
 * where the insertion line showed: depths shallower than the row below would
 * land after that row's whole subtree, so they're excluded. Dropping deeper
 * than the row above is only possible when that row is a Group — the row
 * becomes its first child. Returns null when the only resolution would put a
 * Group inside its own subtree.
 */
export function resolveDropTarget<T extends GroupableLine>(
	rows: ReadonlyArray<BoardRow<T>>,
	draggedId: string,
	gapIndex: number,
	depthHint: number,
): DropTarget | null {
	const draggedIndex = rows.findIndex((row) => row.line.id === draggedId);
	const rest = rows.filter((row) => row.line.id !== draggedId);
	// The gap is in displayed coordinates (which include the dragged row);
	// shift it into `rest` coordinates.
	const restGap =
		draggedIndex >= 0 && draggedIndex < gapIndex ? gapIndex - 1 : gapIndex;
	const above = rest[restGap - 1] ?? null;
	const below = rest[restGap] ?? null;

	if (above === null) {
		// Top edge: only the top level is reachable.
		return {
			groupId: null,
			beforeId: null,
			afterId: below?.line.id ?? null,
			depth: 0,
		};
	}

	// Snap the hint to a valid depth: sibling depths run from the below row's
	// depth up to the above row's; "into the Group above" sits one deeper.
	const into = above.line.isGroup ? above.depth + 1 : null;
	const minSibling = below === null ? 0 : below.depth;
	const maxSibling = above.depth;
	let depth: number;
	if (into !== null && depthHint >= into) {
		depth = into;
	} else if (minSibling <= maxSibling) {
		depth = Math.max(minSibling, Math.min(maxSibling, depthHint));
	} else {
		// The row below is deeper than the row above (a Group header directly
		// above its first child): only "into the Group" keeps the drop where
		// the insertion line showed.
		depth = into ?? maxSibling;
	}

	const byId = new Map(rest.map((row) => [row.line.id, row]));
	/** A Group must never land inside its own subtree. */
	const isSafeParent = (groupId: string | null): boolean => {
		let current = groupId;
		const seen = new Set<string>();
		while (current !== null && !seen.has(current)) {
			if (current === draggedId) return false;
			seen.add(current);
			current = byId.get(current)?.parentId ?? null;
		}
		return true;
	};

	if (depth === above.depth + 1) {
		// First child of the Group above.
		const groupId = above.line.id;
		if (!isSafeParent(groupId)) return null;
		return {
			groupId,
			beforeId: null,
			afterId: below?.parentId === groupId ? below.line.id : null,
			depth,
		};
	}

	// Sibling drop: the row at `depth` whose subtree holds the above row.
	let pivot = above;
	while (pivot.depth > depth) {
		const parent =
			pivot.parentId === null ? undefined : byId.get(pivot.parentId);
		if (!parent) break;
		pivot = parent;
	}
	if (!isSafeParent(pivot.parentId)) return null;
	return {
		groupId: pivot.parentId,
		beforeId: pivot.line.id,
		afterId: below !== null && below.depth === depth ? below.line.id : null,
		depth,
	};
}
