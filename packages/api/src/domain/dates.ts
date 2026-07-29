// Date-only helpers. All dates are ISO strings (YYYY-MM-DD); ISO strings
// compare lexicographically, which is why these stay string-based.

export type IsoDate = string;

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isIsoDate = (value: string): value is IsoDate =>
	ISO_DATE_RE.test(value);

/** A range is valid when End is on or after Start. */
export const isValidRange = (start: IsoDate, end: IsoDate): boolean =>
	start <= end;

export type TimelineWindow = { start: IsoDate; end: IsoDate };

/**
 * The Project's visible date range (CONTEXT.md — Timeline Window):
 * seeded by the Project's own dates and auto-expanding to fit every Line.
 * It never clamps Lines.
 */
export function deriveWindow(
	lines: ReadonlyArray<{ startDate: IsoDate; endDate: IsoDate }>,
	seed: { seedStart: IsoDate; seedEnd: IsoDate },
): TimelineWindow {
	let start = seed.seedStart;
	let end = seed.seedEnd;
	for (const line of lines) {
		if (line.startDate < start) start = line.startDate;
		if (line.endDate > end) end = line.endDate;
	}
	return { start, end };
}

const DAY_MS = 86_400_000;

/** Shifts an ISO date by whole days (UTC, so no timezone drift). */
export function addDays(iso: IsoDate, days: number): IsoDate {
	const date = new Date(`${iso}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

/** Whole-day difference between two ISO dates (b - a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
	return Math.round(
		(Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) /
			DAY_MS,
	);
}
