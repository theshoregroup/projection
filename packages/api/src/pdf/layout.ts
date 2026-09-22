// PDF layout for the Board export (ADR 0001, ADR 0010): pure types,
// constants, and layout math shared with the renderer in render.ts. This
// module has **no pdf-lib import** so routers (and tests) can pull in the
// page-size vocabulary without dragging the PDF engine into every request.
// The heavy render path is loaded lazily via `await import("../pdf/render")`.

import { diffDays, type IsoDate } from "../domain/dates";
import { type Geometry, HEADER_HEIGHT, INDENT_PX } from "../domain/geometry";
import type { GroupableLine } from "../domain/groups";

// ---------------------------------------------------------------------------
// Public types

/** Page sizes supported by the export (all landscape). A3 is the default. */
export const PDF_PAGE_SIZES = ["A3", "A2", "A1", "A0"] as const;
export type PdfPageSize = (typeof PDF_PAGE_SIZES)[number];

/** The minimal Project the export needs (BoardView receives the same shape). */
export interface PdfProject {
	id: string;
	name: string;
	description?: string | null;
	seedStart: IsoDate;
	seedEnd: IsoDate;
	colorPalette?: string;
}

/** The Line shape the export draws (the Board's LineRow satisfies this). */
export interface PdfBoardLine extends GroupableLine {
	item: string;
	assignee: string | null;
	note: string | null;
	percentComplete: number;
	isMilestone: boolean;
}

// ---------------------------------------------------------------------------
// Layout constants (points; 1pt ≈ 1px at 1:1, so geometry numbers carry over)

/** Named page dimensions in points, portrait (width × height). */
export const PAGE_DIMENSIONS: Record<
	PdfPageSize,
	{ width: number; height: number }
> = {
	A3: { width: 841.89, height: 1190.55 },
	A2: { width: 1190.55, height: 1683.78 },
	A1: { width: 1683.78, height: 2383.94 },
	A0: { width: 2383.94, height: 3370.39 },
};

export const PAGE_MARGIN = 36;
export const TITLE_BLOCK_HEIGHT = 40;
export const FOOTER_HEIGHT = 24;
export const ASSIGNEE_COL_WIDTH = 60;
export const DATE_COL_WIDTH = 48;
export const ITEM_COL_WIDTH = 100;
export const PANEL_WIDTH =
	ITEM_COL_WIDTH + ASSIGNEE_COL_WIDTH + DATE_COL_WIDTH * 2;
const MIN_PDF_DAY_WIDTH = 1.5;
/** Scale-to-fit ceiling: 28 is the Board's day-tick threshold (tickUnitFor),
 * so short windows show day columns on paper large enough to hold them. */
const MAX_PDF_DAY_WIDTH = 28;
/** Paper rows are much thinner than the Board's 36px rows, so ~45 fit on
 * one A3 landscape page. Everything vertical keys off this one constant. */
export const PDF_ROW_HEIGHT = 14;
/** Bar vertical padding: the Board's 6px inset at 36px scales to ~2.5pt. */
export const BAR_PAD = 2.5;
/** Milestone diamonds shrink to fit the thinner rows (Board: 9px). */
export const PDF_DIAMOND_SIZE = 6;
export const NOTE_FONT_SIZE = 7;
export const TICK_FONT_SIZE = 8;
export const ROW_TEXT_FONT_SIZE = 8;
export const ASSIGNEE_FONT_SIZE = 7;
export const DATE_FONT_SIZE = 7;
/** Wrapped-row metrics: each wrapped text line plus vertical padding. */
export const LINE_HEIGHT = ROW_TEXT_FONT_SIZE * 1.25;
export const ROW_VPAD = 3;

// ---------------------------------------------------------------------------
// Exported layout decisions (unit-tested without touching pdf-lib)

export interface PdfLayout {
	geom: Geometry;
	rowsPerPage: number;
	/** Timeline width in points after scale-to-fit. */
	timelineWidth: number;
	pageWidth: number;
	pageHeight: number;
}

/**
 * Scale-to-fit: the Timeline Window's total days are squeezed into the
 * chosen page's timeline column by shrinking dayWidth (never growing past
 * the Board's default zoom). Tick granularity follows automatically via
 * tickUnitFor — short windows show days, longer ones weeks or months.
 */
export function pdfLayout(
	pageSize: PdfPageSize,
	window: { start: IsoDate; end: IsoDate },
): PdfLayout {
	const dims = PAGE_DIMENSIONS[pageSize];
	// Landscape: swap the named portrait dimensions
	const pageWidth = dims.height;
	const pageHeight = dims.width;

	const timelineWidth = pageWidth - PAGE_MARGIN * 2 - PANEL_WIDTH;
	const totalDays = Math.max(1, diffDays(window.start, window.end) + 1);
	const dayWidth = Math.max(
		MIN_PDF_DAY_WIDTH,
		Math.min(MAX_PDF_DAY_WIDTH, timelineWidth / totalDays),
	);

	const bodyHeight =
		pageHeight - PAGE_MARGIN * 2 - TITLE_BLOCK_HEIGHT - FOOTER_HEIGHT;
	// −2 for the board container's top/bottom borders
	const rowsPerPage = Math.max(
		1,
		Math.floor((bodyHeight - HEADER_HEIGHT - 2) / PDF_ROW_HEIGHT),
	);

	return {
		geom: { start: window.start, end: window.end, dayWidth },
		rowsPerPage,
		// Fill the timeline column exactly: the smallest dayWidth on a whole-day
		// boundary that still fits, so the renderer never rescales the drawing.
		timelineWidth: totalDays * dayWidth,
		pageWidth,
		pageHeight,
	};
}

/** Vertical space (pt) available for rows on one page: the body minus the
 * repeated axis header and the board container's top/bottom borders. */
export function bodyRowSpace(pageSize: PdfPageSize): number {
	const dims = PAGE_DIMENSIONS[pageSize];
	const pageHeight = dims.width; // landscape
	return (
		pageHeight -
		PAGE_MARGIN * 2 -
		TITLE_BLOCK_HEIGHT -
		FOOTER_HEIGHT -
		HEADER_HEIGHT -
		2
	);
}

/**
 * Word-boundary wrap into lines that fit `widthPt`, using the same 0.52
 * average char-width heuristic the Board's truncators use. Words longer than
 * a full line are hard-broken at the limit. This is the single source of
 * truth for wrapping: rowHeightFor sizes rows from these line counts and the
 * renderer draws exactly these lines, so text can never overflow its row.
 */
export function wrapText(
	text: string,
	widthPt: number,
	fontSize: number,
): string[] {
	if (!text.trim()) return [""];
	const maxChars = Math.max(1, Math.floor(widthPt / (fontSize * 0.52)));
	const lines: string[] = [];
	let current = "";
	for (const word of text.split(/\s+/).filter(Boolean)) {
		if (word.length > maxChars) {
			if (current) {
				lines.push(current);
				current = "";
			}
			for (let i = 0; i < word.length; i += maxChars) {
				lines.push(word.slice(i, i + maxChars));
			}
			continue;
		}
		const next = current ? `${current} ${word}` : word;
		if (next.length <= maxChars) {
			current = next;
		} else {
			lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines.length > 0 ? lines : [""];
}

/** How many text lines a panel cell wraps to at its column width. */
export function textLines(
	text: string,
	widthPt: number,
	fontSize: number,
): number {
	return wrapText(text, widthPt, fontSize).length;
}

/** A paper row grows when the Item or Assignee text wraps: it is the tallest
 * of the two cells, with a little vertical breathing room, and never shorter
 * than the compact single-line row. */
export function rowHeightFor(line: PdfBoardLine, depth: number): number {
	const itemWidth = ITEM_COL_WIDTH - depth * INDENT_PX;
	const lines = Math.max(
		textLines(line.item, itemWidth, ROW_TEXT_FONT_SIZE),
		textLines(line.assignee ?? "", ASSIGNEE_COL_WIDTH, ASSIGNEE_FONT_SIZE),
	);
	return Math.max(PDF_ROW_HEIGHT, lines * LINE_HEIGHT + ROW_VPAD);
}

/** Greedy vertical pagination: pack rows onto a page until the next row's
 * height would overflow, so tall (wrapped) rows shrink their page's count.
 * Always at least one row per page so a single huge row still exports. */
export function paginateRows<T extends { line: PdfBoardLine; depth: number }>(
	rows: T[],
	rowSpace: number,
): T[][] {
	const pages: T[][] = [];
	let page: T[] = [];
	let used = 0;
	for (const row of rows) {
		const h = rowHeightFor(row.line, row.depth);
		if (page.length > 0 && used + h > rowSpace) {
			pages.push(page);
			page = [];
			used = 0;
		}
		page.push(row);
		used += h;
	}
	if (page.length > 0 || pages.length === 0) pages.push(page);
	return pages;
}

/** Per-row top offsets (pt) within one page's drawing area: the prefix sums
 * of the row heights, so bars/separators/notes align with the variable panel
 * rows. Offsets are y-down from the board's top edge (svgY). */
export function rowTops<T extends { line: PdfBoardLine; depth: number }>(
	rows: T[],
): number[] {
	const tops: number[] = [];
	let y = HEADER_HEIGHT;
	for (const row of rows) {
		tops.push(y);
		y += rowHeightFor(row.line, row.depth);
	}
	return tops;
}

/** Rough char-count truncation for in-bar notes: pdf-lib draws single-line
 * text and never truncates itself. */
export function truncate(text: string, widthPt: number): string {
	const maxChars = Math.max(0, Math.floor(widthPt / (NOTE_FONT_SIZE * 0.52)));
	if (text.length <= maxChars) return text;
	return maxChars < 2 ? "" : `${text.slice(0, maxChars - 1)}…`;
}
