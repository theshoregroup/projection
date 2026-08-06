/** Row-reorder math for the Board: where a dragged Line lands. The
 * insertion-line highlight and the drop itself both derive from the same
 * gap, so the visual can never disagree with the result. */

/** The border (gap) a dragged row hovers, in displayed row coordinates:
 * 0 = above the first row, lines.length = below the last. Hovering a row
 * below the dragged one inserts *after* it; at or above it, *before* it. */
export function insertionGap(
	lines: Array<{ id: string }>,
	lineId: string,
	targetIndex: number,
): number {
	const current = lines.findIndex((line) => line.id === lineId);
	return targetIndex > current ? targetIndex + 1 : targetIndex;
}

/** Neighbours a dragged row would land between at a hovered row index. */
export function computeReorderTargets(
	lines: Array<{ id: string }>,
	lineId: string,
	targetIndex: number,
): { beforeId: string | null; afterId: string | null } {
	const rest = lines.filter((line) => line.id !== lineId);
	// In `rest` every hovered row inserts at its own index: the gap in
	// display coordinates shifts down by one past the removed row, which
	// cancels the shift in `rest`.
	return {
		beforeId: rest[targetIndex - 1]?.id ?? null,
		afterId: rest[targetIndex]?.id ?? null,
	};
}
