// Sparse row ordering for Lines: new rows are appended a full gap after the
// current maximum; reorders take the midpoint between two neighbours.

export const SORT_GAP = 1024;

export function sortOrderAtEnd(existing: ReadonlyArray<number>): number {
	if (existing.length === 0) return SORT_GAP;
	return Math.max(...existing) + SORT_GAP;
}

export function sortOrderBetween(
	before: number | null,
	after: number | null,
): number {
	if (before === null && after === null) return SORT_GAP;
	if (before === null) return (after as number) - SORT_GAP;
	if (after === null) return before + SORT_GAP;
	return before + (after - before) / 2;
}
