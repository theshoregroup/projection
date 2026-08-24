// PDF renderer for the Board (ADR 0001): consumes the same pure geometry as
// the browser's SVG renderer (domain/geometry, domain/colors), so the export
// and the on-screen Board can never drift. Nothing here re-implements layout.

import {
	Document,
	G,
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
	DIAMOND_SIZE,
	diamondPath,
	type Geometry,
	groupCapPaths,
	HEADER_HEIGHT,
	INDENT_PX,
	ROW_HEIGHT,
	rowY,
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
const NOTE_FONT_SIZE = 8;
const TICK_FONT_SIZE = 8;
const ROW_TEXT_FONT_SIZE = 10;
const ASSIGNEE_FONT_SIZE = 8;
const DATE_FONT_SIZE = 8;

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
		justifyContent: "flex-end",
		paddingBottom: 8,
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
		height: ROW_HEIGHT,
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
		textAlign: "right",
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
		Math.floor((bodyHeight - HEADER_HEIGHT - 2) / ROW_HEIGHT),
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

// ---------------------------------------------------------------------------
// Svg drawing (mirrors the Board's SVG layers, minus interaction chrome)

function BoardSvg({
	layout,
	rows,
}: {
	layout: PdfLayout;
	rows: Array<BoardRow<PdfBoardLine>>;
}) {
	const { geom } = layout;
	const width = layout.timelineWidth;
	const height = HEADER_HEIGHT + rows.length * ROW_HEIGHT;
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
					y1={rowY(index) + ROW_HEIGHT - 0.5}
					y2={rowY(index) + ROW_HEIGHT - 0.5}
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
				const cy = rowY(index) + ROW_HEIGHT / 2;
				const note = (line as { note?: string | null }).note ?? null;
				const percentComplete =
					(line as { percentComplete?: number }).percentComplete ?? 0;

				if (line.isGroup) {
					const capTop = cy - 3;
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
									y={cy + 3}
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
							<Path d={diamondPath(bar.x, cy)} fill={color} />
							{note ? (
								<Text
									x={bar.x + DIAMOND_SIZE + 4}
									y={cy + 3}
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
				return (
					<G key={line.id}>
						<Rect
							x={barX}
							y={rowY(index) + 6}
							width={barW}
							height={ROW_HEIGHT - 12}
							rx={BAR_RADIUS}
							fill={color}
							fillOpacity={0.85}
						/>
						{percentComplete > 0 ? (
							<Rect
								x={barX}
								y={rowY(index) + 6}
								width={(barW * percentComplete) / 100}
								height={ROW_HEIGHT - 12}
								rx={BAR_RADIUS}
								fill={COLOR_BAR_SHADE}
								fillOpacity={0.35}
							/>
						) : null}
						{note ? (
							<Text
								x={barX + 6}
								y={cy + 3}
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
}: BoardPdfProps) {
	const window = deriveWindow(lines, project);
	const rows = buildRows(lines);
	const layout = pdfLayout(pageSize, window);

	// Vertical pagination: chunk the flattened rows, axis header repeated
	const pages: Array<Array<BoardRow<PdfBoardLine>>> = [];
	for (let i = 0; i < rows.length; i += layout.rowsPerPage) {
		pages.push(rows.slice(i, i + layout.rowsPerPage));
	}
	if (pages.length === 0) pages.push([]); // an empty Project still exports

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
						<Text style={styles.title}>{project.name}</Text>
						{project.description ? (
							<Text style={styles.description}>{project.description}</Text>
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
							{pageRows.map((row) => (
								<View
									key={row.line.id}
									style={[
										styles.rowLine,
										{ paddingLeft: 4 + row.depth * INDENT_PX },
									]}
								>
									<Text
										style={[
											styles.rowItem,
											{ width: ITEM_COL_WIDTH - row.depth * INDENT_PX },
											row.line.isGroup ? styles.rowItemGroup : {},
										]}
									>
										{truncateRowText(
											row.line.item,
											ITEM_COL_WIDTH - row.depth * INDENT_PX,
										)}
									</Text>
									<Text style={styles.rowAssignee}>
										{truncateRowText(
											row.line.assignee ?? "",
											ASSIGNEE_COL_WIDTH,
										)}
									</Text>
									<Text style={styles.rowDate}>{row.line.startDate}</Text>
									<Text style={styles.rowDate}>{row.line.endDate}</Text>
								</View>
							))}
						</View>

						{/* Right column: the timeline */}
						<BoardSvg layout={layout} rows={pageRows} />
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

function truncateRowText(text: string, widthPt: number): string {
	const maxChars = Math.max(
		0,
		Math.floor(widthPt / (ROW_TEXT_FONT_SIZE * 0.52)),
	);
	if (text.length <= maxChars) return text;
	return maxChars < 2 ? "" : `${text.slice(0, maxChars - 1)}…`;
}

/** Renders a Project's Board to PDF bytes; shared by the authenticated
 * exportPdf and the public exportPdfByToken procedures. */
export async function renderBoardPdf(
	project: PdfProject,
	lines: PdfBoardLine[],
	pageSize: PdfPageSize,
): Promise<{ filename: string; data: Uint8Array }> {
	const element = createElement(BoardPdfDocument, { project, lines, pageSize });
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
