// PDF renderer for the Board (ADR 0001): consumes the same pure geometry as
// the browser's SVG renderer (domain/geometry, domain/colors), so the export
// and the on-screen Board can never drift. Nothing here re-implements layout.

import {
	Document,
	G,
	Image,
	Page,
	Path,
	Line as PdfLine,
	Rect,
	renderToBuffer,
	StyleSheet,
	Svg,
	Text,
	View,
} from "@react-pdf/renderer";
import { createElement } from "react";
import { assigneeColor } from "../domain/colors";
import { deriveWindow, diffDays, type IsoDate } from "../domain/dates";
import {
	BAR_INSET,
	BAR_RADIUS,
	barForLine,
	type Geometry,
	groupCapPaths,
	HEADER_HEIGHT,
	INDENT_PX,
	ticksFor,
	weekendSpans,
} from "../domain/geometry";
import { type BoardRow, buildRows, type GroupableLine } from "../domain/groups";

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
}

/** The Line shape the export draws (the Board's LineRow satisfies this). */
export interface PdfBoardLine extends GroupableLine {
	item: string;
	assignee: string | null;
	note: string | null;
	percentComplete: number;
	isMilestone: boolean;
}

export interface BoardPdfProps {
	project: PdfProject;
	lines: PdfBoardLine[];
	pageSize: PdfPageSize;
	/** Render date shown in the footer; injected for tests. Defaults to now. */
	generatedAt?: Date;
	/** If provided, the org logo is rendered in the top-right of each page. */
	orgLogoUrl?: string;
}

// ---------------------------------------------------------------------------
// Layout constants (points; 1pt ≈ 1px at 1:1, so geometry numbers carry over)

/** Named page dimensions in points, portrait (width × height). */
const PAGE_DIMENSIONS: Record<PdfPageSize, { width: number; height: number }> =
	{
		A3: { width: 841.89, height: 1190.55 },
		A2: { width: 1190.55, height: 1683.78 },
		A1: { width: 1683.78, height: 2383.94 },
		A0: { width: 2383.94, height: 3370.39 },
	};

const ORG_LOGO_HEIGHT = 28;
const PAGE_MARGIN = 36;
const TITLE_BLOCK_HEIGHT = 40;
const FOOTER_HEIGHT = 24;
const ASSIGNEE_COL_WIDTH = 80;
const DATE_COL_WIDTH = 64;
const ITEM_COL_WIDTH = 140;
const PANEL_WIDTH = ITEM_COL_WIDTH + ASSIGNEE_COL_WIDTH + DATE_COL_WIDTH * 2;
const MIN_PDF_DAY_WIDTH = 1.5;
/** Scale-to-fit ceiling: 28 is the Board's day-tick threshold (tickUnitFor),
 * so short windows show day columns on paper large enough to hold them. */
const MAX_PDF_DAY_WIDTH = 28;
/** Paper rows are much thinner than the Board's 36px rows, so ~45 fit on
 * one A3 landscape page. Everything vertical keys off this one constant. */
const PDF_ROW_HEIGHT = 14;
/** Bar vertical padding: the Board's 6px inset at 36px scales to ~2.5pt. */
const BAR_PAD = 2.5;
/** Milestone diamonds shrink to fit the thinner rows (Board: 9px). */
const PDF_DIAMOND_SIZE = 6;
const NOTE_FONT_SIZE = 7;
const TICK_FONT_SIZE = 8;
const ROW_TEXT_FONT_SIZE = 8;
const ASSIGNEE_FONT_SIZE = 7;
const DATE_FONT_SIZE = 7;
/** Wrapped-row metrics: each wrapped text line plus vertical padding. */
const LINE_HEIGHT = ROW_TEXT_FONT_SIZE * 1.25;
const ROW_VPAD = 3;

/** Milestone diamond path centered at (cx, cy), sized for the paper rows. */
function pdfDiamondPath(cx: number, cy: number): string {
	const s = PDF_DIAMOND_SIZE;
	return `M ${cx} ${cy - s} L ${cx + s} ${cy} L ${cx} ${cy + s} L ${cx - s} ${cy} Z`;
}

// Light-theme colors (packages/ui globals.css — PDFs print on white)
const COLOR_BORDER = "#e9e4df";
const COLOR_MUTED = "#77716c";
// The Board shades weekends fill-muted-foreground/10 ≈ a flat light gray on paper
const COLOR_WEEKEND = "#edecea";
const COLOR_TEXT = "#1c1917";
const COLOR_BAR_SHADE = "#000000";

// ---------------------------------------------------------------------------
// Styles (DOM side of the page; the timeline itself is one Svg per page)

const styles = StyleSheet.create({
	page: {
		paddingTop: PAGE_MARGIN,
		paddingBottom: PAGE_MARGIN,
		paddingLeft: PAGE_MARGIN,
		paddingRight: PAGE_MARGIN,
		fontFamily: "Helvetica",
		color: COLOR_TEXT,
	},
	titleBlock: {
		height: TITLE_BLOCK_HEIGHT,
		flexDirection: "row",
		alignItems: "flex-end",
		paddingBottom: 8,
	},
	titleText: {
		flex: 1,
	},
	title: {
		fontSize: 16,
		fontWeight: "bold",
	},
	description: {
		fontSize: 9,
		color: COLOR_MUTED,
		marginTop: 2,
	},
	orgLogo: {
		height: ORG_LOGO_HEIGHT,
		maxWidth: 200,
		marginBottom: 4,
		marginLeft: 16,
	},
	board: {
		flexDirection: "row",
		borderTopWidth: 1,
		borderBottomWidth: 1,
		borderColor: COLOR_BORDER,
	},
	panel: {
		width: PANEL_WIDTH,
		borderRightWidth: 1,
		borderRightColor: COLOR_BORDER,
	},
	panelHeader: {
		height: HEADER_HEIGHT,
		flexDirection: "row",
		alignItems: "flex-end",
		paddingBottom: 6,
		paddingLeft: 4,
		borderBottomWidth: 1,
		borderBottomColor: COLOR_BORDER,
	},
	panelHeaderText: {
		fontSize: 8,
		color: COLOR_MUTED,
	},
	rowLine: {
		flexDirection: "row",
		alignItems: "center",
		borderBottomWidth: 0.5,
		borderBottomColor: COLOR_BORDER,
		paddingRight: 4,
	},
	rowItem: {
		fontSize: ROW_TEXT_FONT_SIZE,
	},
	rowItemGroup: {
		fontWeight: "bold",
	},
	rowAssignee: {
		fontSize: ASSIGNEE_FONT_SIZE,
		color: COLOR_MUTED,
		width: ASSIGNEE_COL_WIDTH,
	},
	rowDate: {
		fontSize: DATE_FONT_SIZE,
		color: COLOR_MUTED,
		width: DATE_COL_WIDTH,
		textAlign: "center",
	},
	footer: {
		height: FOOTER_HEIGHT,
		justifyContent: "flex-end",
		alignItems: "flex-end",
	},
	footerText: {
		fontSize: 8,
		color: COLOR_MUTED,
	},
});

// ---------------------------------------------------------------------------
// Exported layout decisions (unit-tested without touching react-pdf)

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
		// boundary that still fits, so react-pdf never rescales the Svg.
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

/** How many text lines a panel cell wraps to at its column width. Uses the
 * same 0.52 char-width heuristic as the truncators, inverted to count. */
export function textLines(
	text: string,
	widthPt: number,
	fontSize: number,
): number {
	const charsPerLine = Math.max(1, Math.floor(widthPt / (fontSize * 0.52)));
	return Math.max(1, Math.ceil(text.length / charsPerLine));
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

/** Per-row top offsets (pt) within one page's Svg: the prefix sums of the
 * row heights, so bars/separators/notes align with the variable panel rows. */
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

// ---------------------------------------------------------------------------
// Svg drawing (mirrors the Board's SVG layers, minus interaction chrome)

function BoardSvg({
	layout,
	rows,
	tops,
}: {
	layout: PdfLayout;
	rows: Array<BoardRow<PdfBoardLine>>;
	/** Per-row top offsets from rowTops() — matches the variable panel rows. */
	tops: number[];
}) {
	const { geom } = layout;
	const width = layout.timelineWidth;
	const lastRow = rows.length > 0 ? rows[rows.length - 1] : undefined;
	const height =
		lastRow === undefined
			? HEADER_HEIGHT
			: (tops[rows.length - 1] ?? HEADER_HEIGHT) +
				rowHeightFor(lastRow.line, lastRow.depth);
	const ticks = ticksFor(geom);
	const weekends = weekendSpans(geom);

	return (
		<Svg width={width} height={height}>
			{/* Weekend shading (calendar days — shaded, not excluded) */}
			{weekends.map((span) => (
				<Rect
					key={`weekend-${span.x}`}
					x={span.x}
					y={0}
					width={span.width}
					height={height}
					fill={COLOR_WEEKEND}
				/>
			))}

			{/* Tick gridlines */}
			{ticks.map((tick) => (
				<PdfLine
					key={`tick-${tick.date}`}
					x1={tick.x}
					x2={tick.x}
					y1={HEADER_HEIGHT - 16}
					y2={height}
					stroke={COLOR_BORDER}
					strokeWidth={1}
					strokeOpacity={tick.major ? 0.9 : 0.35}
				/>
			))}

			{/* Row separators */}
			{rows.map((row, index) => (
				<PdfLine
					key={`sep-${row.line.id}`}
					x1={0}
					x2={width}
					y1={
						(tops[index] ?? HEADER_HEIGHT) +
						rowHeightFor(row.line, row.depth) -
						0.5
					}
					y2={
						(tops[index] ?? HEADER_HEIGHT) +
						rowHeightFor(row.line, row.depth) -
						0.5
					}
					stroke={COLOR_BORDER}
					strokeWidth={1}
					strokeOpacity={0.5}
				/>
			))}

			{/* Bars, milestone diamonds, group summary bars, notes */}
			{rows.map((row, index) => {
				const { line } = row;
				const bar = barForLine(geom, line);
				const color = assigneeColor(
					(line as { assignee?: string | null }).assignee,
				);
				const cy =
					(tops[index] ?? HEADER_HEIGHT) +
					rowHeightFor(row.line, row.depth) / 2;
				const note = (line as { note?: string | null }).note ?? null;
				const percentComplete =
					(line as { percentComplete?: number }).percentComplete ?? 0;

				if (line.isGroup) {
					// The summary bar + caps are 12pt tall total; centering them keeps
					// the caps inside the thinner paper rows.
					const capTop = cy - 6;
					const caps = groupCapPaths(bar.x, bar.width, capTop);
					return (
						<G key={line.id}>
							<Rect
								x={bar.x + BAR_INSET}
								y={capTop}
								width={Math.max(bar.width - BAR_INSET * 2, 2)}
								height={6}
								rx={1.5}
								fill={color}
								fillOpacity={0.9}
							/>
							<Path d={caps.left} fill={color} />
							<Path d={caps.right} fill={color} />
							{note ? (
								<Text
									x={bar.x + 6}
									y={cy + 2.5}
									fill="#ffffff"
									style={{ fontSize: NOTE_FONT_SIZE }}
								>
									{truncate(note, bar.width - 12)}
								</Text>
							) : null}
						</G>
					);
				}

				if (bar.isMilestone) {
					return (
						<G key={line.id}>
							<Path d={pdfDiamondPath(bar.x, cy)} fill={color} />
							{note ? (
								<Text
									x={bar.x + PDF_DIAMOND_SIZE + 4}
									y={cy + 2.5}
									fill={COLOR_MUTED}
									style={{ fontSize: NOTE_FONT_SIZE }}
								>
									{/* the Board gives milestone notes a 192px column */}
									{truncate(note, 192)}
								</Text>
							) : null}
						</G>
					);
				}

				const barX = bar.x + BAR_INSET;
				const barW = Math.max(bar.width - BAR_INSET * 2, 2);
				// Bars keep the compact height and center within the (possibly
				// wrapped, taller) row.
				const barH = PDF_ROW_HEIGHT - BAR_PAD * 2;
				const barY = cy - barH / 2;
				return (
					<G key={line.id}>
						<Rect
							x={barX}
							y={barY}
							width={barW}
							height={barH}
							rx={BAR_RADIUS}
							fill={color}
							fillOpacity={0.85}
						/>
						{percentComplete > 0 ? (
							<Rect
								x={barX}
								y={barY}
								width={(barW * percentComplete) / 100}
								height={barH}
								rx={BAR_RADIUS}
								fill={COLOR_BAR_SHADE}
								fillOpacity={0.35}
							/>
						) : null}
						{note ? (
							<Text
								x={barX + 6}
								y={cy + 2.5}
								fill="#ffffff"
								style={{ fontSize: NOTE_FONT_SIZE }}
							>
								{truncate(note, barW - 12)}
							</Text>
						) : null}
					</G>
				);
			})}

			{/* Axis labels on top (drawn last, like the Board) */}
			{ticks.map((tick) => (
				<Text
					key={`label-${tick.date}`}
					x={tick.x + 4}
					y={HEADER_HEIGHT - 20}
					fill={COLOR_MUTED}
					style={{
						fontSize: TICK_FONT_SIZE,
						fontWeight: tick.major ? "bold" : "normal",
					}}
				>
					{tick.label}
				</Text>
			))}
		</Svg>
	);
}

/** Rough char-count truncation: react-pdf Svg text never truncates itself. */
function truncate(text: string, widthPt: number): string {
	const maxChars = Math.max(0, Math.floor(widthPt / (NOTE_FONT_SIZE * 0.52)));
	if (text.length <= maxChars) return text;
	return maxChars < 2 ? "" : `${text.slice(0, maxChars - 1)}…`;
}

// ---------------------------------------------------------------------------
// The document

export function BoardPdfDocument({
	project,
	lines,
	pageSize,
	generatedAt = new Date(),
	orgLogoUrl,
}: BoardPdfProps) {
	const window = deriveWindow(lines, project);
	const rows = buildRows(lines);
	const layout = pdfLayout(pageSize, window);

	// Vertical pagination: pack rows by their (variable, wrap-aware) heights,
	// axis header repeated on each page. An empty Project still exports.
	const pages = paginateRows(rows, bodyRowSpace(pageSize));

	const generated = generatedAt.toISOString().slice(0, 10);

	return (
		<Document title={`${project.name} — Board`}>
			{pages.map((pageRows, pageIndex) => (
				<Page
					key={`page-${pageIndex}`}
					size={pageSize}
					orientation="landscape"
					style={styles.page}
				>
					<View style={styles.titleBlock}>
						<View style={styles.titleText}>
							<Text style={styles.title}>{project.name}</Text>
							{project.description ? (
								<Text style={styles.description}>{project.description}</Text>
							) : null}
						</View>
						{orgLogoUrl ? (
							<Image style={styles.orgLogo} src={orgLogoUrl} />
						) : null}
					</View>

					<View style={styles.board}>
						{/* Left column: Item / Assignee (mirrors the Board's side panel) */}
						<View style={styles.panel}>
							<View style={styles.panelHeader}>
								<Text style={[styles.panelHeaderText, { flexGrow: 1 }]}>
									Item
								</Text>
								<Text
									style={[
										styles.panelHeaderText,
										{ width: ASSIGNEE_COL_WIDTH },
									]}
								>
									Assignee
								</Text>
								<Text style={[styles.panelHeaderText, styles.rowDate]}>
									Start
								</Text>
								<Text style={[styles.panelHeaderText, styles.rowDate]}>
									End
								</Text>
							</View>
							{pageRows.map((row) => {
								// Item/Assignee show in full — Text wraps within its fixed
								// width, and the row height (shared with the Svg via rowTops)
								// grows to fit the tallest wrapped cell.
								const height = rowHeightFor(row.line, row.depth);
								return (
									<View
										key={row.line.id}
										style={[
											styles.rowLine,
											{ paddingLeft: 4 + row.depth * INDENT_PX, height },
										]}
									>
										<Text
											style={[
												styles.rowItem,
												{ width: ITEM_COL_WIDTH - row.depth * INDENT_PX },
												row.line.isGroup ? styles.rowItemGroup : {},
											]}
										>
											{row.line.item}
										</Text>
										<Text style={styles.rowAssignee}>
											{row.line.assignee ?? ""}
										</Text>
										<Text style={styles.rowDate}>{row.line.startDate}</Text>
										<Text style={styles.rowDate}>{row.line.endDate}</Text>
									</View>
								);
							})}
						</View>

						{/* Right column: the timeline */}
						<BoardSvg
							layout={layout}
							rows={pageRows}
							tops={rowTops(pageRows)}
						/>
					</View>

					<View style={styles.footer}>
						<Text style={styles.footerText}>
							{`${project.name} · exported ${generated} · page ${pageIndex + 1} of ${pages.length}`}
						</Text>
					</View>
				</Page>
			))}
		</Document>
	);
}

/** Renders a Project's Board to PDF bytes; shared by the authenticated
 * exportPdf and the public exportPdfByToken procedures. */
export async function renderBoardPdf(
	project: PdfProject,
	lines: PdfBoardLine[],
	pageSize: PdfPageSize,
	options?: { orgLogoUrl?: string },
): Promise<{ filename: string; data: Uint8Array }> {
	const element = createElement(BoardPdfDocument, {
		project,
		lines,
		pageSize,
		orgLogoUrl: options?.orgLogoUrl,
	});
	const buffer = await renderToBuffer(
		element as unknown as Parameters<typeof renderToBuffer>[0],
	);
	const slug =
		project.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "") || "board";
	return {
		filename: `${slug}-${pageSize.toLowerCase()}.pdf`,
		data: new Uint8Array(buffer),
	};
}
