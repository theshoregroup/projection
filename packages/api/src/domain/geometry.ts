// Pure Board geometry (ADR 0001): lines + timeline window + zoom → positions.
// The SVG renderer in the browser and the react-pdf renderer (pdf/board-pdf)
// both consume these functions, so the Board and its export can never drift.

import { addDays, diffDays, type IsoDate } from "./dates";

export const ROW_HEIGHT = 36;
export const HEADER_HEIGHT = 44;
export const MIN_DAY_WIDTH = 3;
export const MAX_DAY_WIDTH = 140;
export const DEFAULT_DAY_WIDTH = 24;

// Visual constants shared by both renderers (ADR 0001 — write-once).
export const BAR_INSET = 1;
export const BAR_RADIUS = 4;
export const DIAMOND_SIZE = 9;
/** Indent per nesting depth for Group children (CONTEXT.md — Group). */
export const INDENT_PX = 16;

/** Diamond path for a Milestone centered at (cx, cy). */
export function diamondPath(cx: number, cy: number): string {
	return `M ${cx} ${cy - DIAMOND_SIZE} L ${cx + DIAMOND_SIZE} ${cy} L ${cx} ${cy + DIAMOND_SIZE} L ${cx - DIAMOND_SIZE} ${cy} Z`;
}

export interface Geometry {
	/** First visible day of the Timeline Window. */
	start: IsoDate;
	/** Last visible day of the Timeline Window. */
	end: IsoDate;
	/** Horizontal zoom: pixels per day. */
	dayWidth: number;
}

export const totalDays = (g: Geometry): number => diffDays(g.start, g.end) + 1;

export const boardWidth = (g: Geometry): number => totalDays(g) * g.dayWidth;

/** X of the left edge of a day. */
export const dateToX = (g: Geometry, date: IsoDate): number =>
	diffDays(g.start, date) * g.dayWidth;

/** Day containing an X coordinate (rounded to the nearest day boundary). */
export const xToDate = (g: Geometry, x: number): IsoDate =>
	addDays(g.start, Math.round(x / g.dayWidth));

export interface Bar {
	/** Left edge for bars; center for milestone diamonds. */
	x: number;
	/** Zero for milestones. */
	width: number;
	isMilestone: boolean;
}

/** A bar spans Start through End *inclusively*; a Milestone occupies its single day. */
export function barForLine(
	g: Geometry,
	line: { startDate: IsoDate; endDate: IsoDate; isMilestone: boolean },
): Bar {
	if (line.isMilestone) {
		return {
			x: dateToX(g, line.startDate) + g.dayWidth / 2,
			width: 0,
			isMilestone: true,
		};
	}
	return {
		x: dateToX(g, line.startDate),
		width: (diffDays(line.startDate, line.endDate) + 1) * g.dayWidth,
		isMilestone: false,
	};
}

/** The visible X range of the Board's horizontal scroll viewport. */
export interface Viewport {
	startX: number;
	endX: number;
}

/** The edge a bar sits beyond, when it lies entirely outside the viewport. */
export function offscreenSide(
	g: Geometry,
	line: { startDate: IsoDate; endDate: IsoDate; isMilestone: boolean },
	view: Viewport,
): "left" | "right" | null {
	const bar = barForLine(g, line);
	if (bar.x + bar.width <= view.startX) return "left";
	if (bar.x >= view.endX) return "right";
	return null;
}

export type TickUnit = "day" | "week" | "month";

/** Tick granularity follows zoom: days when wide, weeks in the middle, months when tight. */
export function tickUnitFor(dayWidth: number): TickUnit {
	if (dayWidth >= 28) return "day";
	if (dayWidth >= 8) return "week";
	return "month";
}

export interface Tick {
	date: IsoDate;
	x: number;
	label: string;
	/** Major ticks carry the month/year context and a stronger gridline. */
	major: boolean;
}

const MONTH_NAMES = [
	"Jan",
	"Feb",
	"Mar",
	"Apr",
	"May",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Oct",
	"Nov",
	"Dec",
];

const dayOfMonth = (date: IsoDate): number => Number(date.slice(8, 10));
const monthOf = (date: IsoDate): number => Number(date.slice(5, 7)) - 1;
const yearOf = (date: IsoDate): string => date.slice(0, 4);
const monthName = (date: IsoDate): string => MONTH_NAMES[monthOf(date)] ?? "?";

export function ticksFor(g: Geometry): Tick[] {
	const unit = tickUnitFor(g.dayWidth);
	const ticks: Tick[] = [];
	const days = totalDays(g);

	if (unit === "day") {
		for (let i = 0; i < days; i++) {
			const date = addDays(g.start, i);
			const major = dayOfMonth(date) === 1 || i === 0;
			ticks.push({
				date,
				x: dateToX(g, date),
				label: major
					? `${monthName(date)} ${dayOfMonth(date)}`
					: `${dayOfMonth(date)}`,
				major,
			});
		}
		return ticks;
	}

	if (unit === "week") {
		// Tick on Mondays (and the window's first day)
		for (let i = 0; i < days; i++) {
			const date = addDays(g.start, i);
			const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
			if (weekday !== 1 && i !== 0) continue;
			const major = dayOfMonth(date) <= 7 || i === 0;
			ticks.push({
				date,
				x: dateToX(g, date),
				label: `${monthName(date)} ${dayOfMonth(date)}`,
				major,
			});
		}
		return ticks;
	}

	for (let i = 0; i < days; i++) {
		const date = addDays(g.start, i);
		if (dayOfMonth(date) !== 1 && i !== 0) continue;
		ticks.push({
			date,
			x: dateToX(g, date),
			label: `${monthName(date)} ${yearOf(date)}`,
			major: true,
		});
	}
	return ticks;
}

export interface Span {
	x: number;
	width: number;
}

/** Saturday/Sunday columns across the window (calendar days — weekends are shaded, not excluded). */
export function weekendSpans(g: Geometry): Span[] {
	const spans: Span[] = [];
	const days = totalDays(g);
	for (let i = 0; i < days; i++) {
		const date = addDays(g.start, i);
		const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
		if (weekday === 0 || weekday === 6) {
			spans.push({ x: dateToX(g, date), width: g.dayWidth });
		}
	}
	return spans;
}

export const rowY = (index: number): number =>
	HEADER_HEIGHT + index * ROW_HEIGHT;

/** Angled end-cap paths for a Group's summary bar (CONTEXT.md — Group). */
export function groupCapPaths(
	x: number,
	width: number,
	capTop: number,
): { left: string; right: string } {
	return {
		left: `M ${x + BAR_INSET} ${capTop + 6} L ${x + BAR_INSET + 7} ${capTop + 6} L ${x + BAR_INSET} ${capTop + 12} Z`,
		right: `M ${x + width - BAR_INSET} ${capTop + 6} L ${x + width - BAR_INSET - 7} ${capTop + 6} L ${x + width - BAR_INSET} ${capTop + 12} Z`,
	};
}

export const boardHeight = (lineCount: number): number =>
	HEADER_HEIGHT + Math.max(lineCount, 1) * ROW_HEIGHT;
