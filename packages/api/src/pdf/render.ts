// PDF renderer for the Board (ADR 0001, ADR 0010): draws the export with
// pdf-lib — zero-dependency, no native modules, no Node subpath imports, so
// the same code bundles cleanly for Vercel's serverless runtime (the old
// @react-pdf/renderer → pdfkit chain crashed there on '#standard-fonts/*').
//
// This module is loaded lazily (`await import("../pdf/render")`) from the
// exportPdf procedures so pdf-lib is only parsed when someone exports.
//
// Layout math is entirely in ./layout.ts and domain/geometry (shared with
// the browser's SVG renderer). This file only maps those computed positions
// onto pdf-lib draw calls.

import {
	PDFDocument,
	type PDFFont,
	type PDFImage,
	type PDFPage,
	rgb,
	StandardFonts,
} from "pdf-lib";
import { assigneeColor } from "../domain/colors";
import { deriveWindow } from "../domain/dates";
import {
	BAR_INSET,
	BAR_RADIUS,
	barForLine,
	groupCapPaths,
	HEADER_HEIGHT,
	INDENT_PX,
	ticksFor,
	weekendSpans,
} from "../domain/geometry";
import { type BoardRow, buildRows } from "../domain/groups";
import {
	ASSIGNEE_COL_WIDTH,
	ASSIGNEE_FONT_SIZE,
	BAR_PAD,
	bodyRowSpace,
	DATE_COL_WIDTH,
	DATE_FONT_SIZE,
	ITEM_COL_WIDTH,
	LINE_HEIGHT,
	NOTE_FONT_SIZE,
	PAGE_MARGIN,
	PANEL_WIDTH,
	PDF_DIAMOND_SIZE,
	PDF_ROW_HEIGHT,
	type PdfBoardLine,
	type PdfLayout,
	type PdfPageSize,
	type PdfProject,
	paginateRows,
	pdfLayout,
	ROW_TEXT_FONT_SIZE,
	rowHeightFor,
	rowTops,
	TICK_FONT_SIZE,
	TITLE_BLOCK_HEIGHT,
	truncate,
	wrapText,
} from "./layout";

// Light-theme colors (packages/ui globals.css — PDFs print on white)
const COLOR_BORDER = "#e9e4df";
const COLOR_MUTED = "#77716c";
// The Board shades weekends fill-muted-foreground/10 ≈ a flat light gray on paper
const COLOR_WEEKEND = "#edecea";
const COLOR_TEXT = "#1c1917";

// ---------------------------------------------------------------------------
// Coordinate mapping
//
// The layout layer computes top-down ("SVG") coordinates: svgY = 0 at the
// board's top edge, growing downward. PDF pages are y-up (origin at the
// bottom-left), so every y is flipped at draw time via pdfY() for native
// pdf-lib draws (drawText, drawLine, drawRectangle). For drawSvgPath calls
// (bars, caps, diamonds), we pass raw SVG coordinates and set the y offset
// to boardTop — drawSvgPath internally applies scale(1, -1) to flip the
// y axis, which converts SVG y-down to PDF y-up correctly in one step.
// X coordinates carry over unchanged; the timeline sits PANEL_WIDTH right
// of the margin.

/** Flip every y coordinate around the board's top edge (SVG y-down → PDF
 * y-up). Kept for backwards compatibility and tests; the renderer no longer
 * uses this — drawSvgPath applies its own y-flip internally, so passing
 * raw SVG coordinates with a y offset of boardTop is sufficient.
 *
 * Only the M/L/Z absolute commands geometry.ts generates are supported —
 * anything else throws so drift between the renderers is loud, not silently
 * mirrored. */
export function flipSvgPathY(path: string, boardTop: number): string {
	const tokens = path.trim().split(/\s+/);
	const out: string[] = [];
	let i = 0;
	while (i < tokens.length) {
		const cmd = tokens[i];
		if (cmd === "Z" || cmd === "z") {
			out.push("Z");
			i += 1;
			continue;
		}
		if (cmd === "M" || cmd === "L") {
			const x = Number(tokens[i + 1]);
			const y = Number(tokens[i + 2]);
			if (Number.isNaN(x) || Number.isNaN(y)) {
				throw new Error(`flipSvgPathY: malformed path "${path}"`);
			}
			out.push(cmd as string, String(x), String(boardTop - y));
			i += 3;
			continue;
		}
		throw new Error(
			`flipSvgPathY: unsupported command "${cmd}" — geometry paths must stay M/L/Z-only`,
		);
	}
	return out.join(" ");
}

/** Rounded-rectangle path (cubic-bezier corners) in SVG coordinates (y-down);
 * x/y is the rect's top-left. Passed to drawSvgPath, which flips y internally
 * to land on the PDF's y-up page. pdf-lib's drawRectangle has no corner
 * radius, and the Board's bars are visibly rounded, so we path them instead. */
function roundedRectPath(
	x: number,
	y: number,
	width: number,
	height: number,
	radius: number,
): string {
	const r = Math.min(radius, width / 2, height / 2);
	if (r <= 0) {
		return `M ${x} ${y} L ${x + width} ${y} L ${x + width} ${y + height} L ${x} ${y + height} Z`;
	}
	const c = r * 0.5522847498; // circle → cubic bezier constant
	return [
		`M ${x + r} ${y}`,
		`L ${x + width - r} ${y}`,
		`C ${x + width - r + c} ${y} ${x + width} ${y + r - c} ${x + width} ${y + r}`,
		`L ${x + width} ${y + height - r}`,
		`C ${x + width} ${y + height - r + c} ${x + width - r + c} ${y + height} ${x + width - r} ${y + height}`,
		`L ${x + r} ${y + height}`,
		`C ${x + r - c} ${y + height} ${x} ${y + height - r + c} ${x} ${y + height - r}`,
		`L ${x} ${y + r}`,
		`C ${x} ${y + r - c} ${x + r - c} ${y} ${x + r} ${y}`,
		"Z",
	].join(" ");
}

/** Milestone diamond path (y-down SVG space) centered at (cx, cy). */
function pdfDiamondPath(cx: number, cy: number): string {
	const s = PDF_DIAMOND_SIZE;
	return `M ${cx} ${cy - s} L ${cx + s} ${cy} L ${cx} ${cy + s} L ${cx - s} ${cy} Z`;
}

/** CSS hex (#rrggbb) → pdf-lib rgb. Palette colors are always hex. */
function hexColor(hex: string) {
	const h = hex.replace("#", "");
	return rgb(
		Number.parseInt(h.slice(0, 2), 16) / 255,
		Number.parseInt(h.slice(2, 4), 16) / 255,
		Number.parseInt(h.slice(4, 6), 16) / 255,
	);
}

// ---------------------------------------------------------------------------
// Org logo

/** The org logo is stored as a base64 data URI (set via the settings page).
 * Embed failures (bad URI, unsupported format) skip the logo rather than
 * failing the export. */
async function embedOrgLogo(
	doc: PDFDocument,
	dataUri: string,
): Promise<PDFImage | undefined> {
	const match = /^data:image\/(png|jpe?g);base64,(.+)$/.exec(dataUri);
	if (!match) return undefined;
	try {
		const bytes = Buffer.from(match[2] as string, "base64");
		return match[1] === "png"
			? await doc.embedPng(bytes)
			: await doc.embedJpg(bytes);
	} catch {
		return undefined;
	}
}

// ---------------------------------------------------------------------------
// Page drawing

interface PageCtx {
	page: PDFPage;
	layout: PdfLayout;
	/** pdf y of the board container's top edge. */
	boardTop: number;
	font: PDFFont;
	fontBold: PDFFont;
	logo?: PDFImage;
}

function drawTitleBlock(ctx: PageCtx, project: PdfProject, contentTop: number) {
	const { page } = ctx;
	const colorText = hexColor(COLOR_TEXT);
	const colorMuted = hexColor(COLOR_MUTED);
	// Bottom-anchored within the 40pt block (matches the old flex-end layout)
	if (project.description) {
		page.drawText(project.name, {
			x: PAGE_MARGIN,
			y: contentTop - 20,
			size: 16,
			font: ctx.fontBold,
			color: colorText,
		});
		page.drawText(project.description, {
			x: PAGE_MARGIN,
			y: contentTop - TITLE_BLOCK_HEIGHT + 6,
			size: 9,
			font: ctx.font,
			color: colorMuted,
		});
	} else {
		page.drawText(project.name, {
			x: PAGE_MARGIN,
			y: contentTop - TITLE_BLOCK_HEIGHT + 10,
			size: 16,
			font: ctx.fontBold,
			color: colorText,
		});
	}
}

function drawLogo(ctx: PageCtx) {
	const { page, logo } = ctx;
	if (!logo) return;
	// Top-right of the page, straddling the margins (old: top 20, right 30,
	// height 50, aspect preserved).
	const height = 50;
	const width = (logo.width / logo.height) * height;
	page.drawImage(logo, {
		x: page.getWidth() - 30 - width,
		y: page.getHeight() - 20 - height,
		width,
		height,
	});
}

function drawPanel(
	ctx: PageCtx,
	pageRows: Array<BoardRow<PdfBoardLine>>,
	tops: number[],
) {
	const { page, boardTop } = ctx;
	const colorText = hexColor(COLOR_TEXT);
	const colorMuted = hexColor(COLOR_MUTED);
	const colorBorder = hexColor(COLOR_BORDER);
	const pdfY = (svgY: number) => boardTop - svgY;
	const panelX = PAGE_MARGIN;

	const lastRow = pageRows[pageRows.length - 1];
	const contentHeight = lastRow
		? (tops[pageRows.length - 1] ?? HEADER_HEIGHT) +
			rowHeightFor(lastRow.line, lastRow.depth)
		: HEADER_HEIGHT;

	// Shaded columns (Assignee + End) drawn first so text paints on top
	const colorShadedColumn = hexColor(COLOR_WEEKEND);
	page.drawRectangle({
		x: panelX + ITEM_COL_WIDTH,
		y: pdfY(contentHeight),
		width: ASSIGNEE_COL_WIDTH,
		height: contentHeight,
		color: colorShadedColumn,
	});
	page.drawRectangle({
		x: panelX + ITEM_COL_WIDTH + ASSIGNEE_COL_WIDTH + DATE_COL_WIDTH,
		y: pdfY(contentHeight),
		width: DATE_COL_WIDTH,
		height: contentHeight,
		color: colorShadedColumn,
	});

	// Header labels (bottom-aligned with 6pt padding, like the Board's panel)
	const headerBaseline = pdfY(HEADER_HEIGHT) + 8;
	const CELL_PAD = 4;
	const headerLabels: Array<[string, number, number, boolean]> = [
		// [label, xOffset, columnWidth, isShaded] — shading gets darker text
		["Item", 0, ITEM_COL_WIDTH, false],
		["Assignee", ITEM_COL_WIDTH, ASSIGNEE_COL_WIDTH, true],
		["Start", ITEM_COL_WIDTH + ASSIGNEE_COL_WIDTH, DATE_COL_WIDTH, false],
		["End", ITEM_COL_WIDTH + ASSIGNEE_COL_WIDTH + DATE_COL_WIDTH, DATE_COL_WIDTH, true],
	];
	for (const [label, offset, _colW, shaded] of headerLabels) {
		page.drawText(label, {
			x: panelX + offset + CELL_PAD,
			y: headerBaseline,
			size: 8,
			font: ctx.font,
			color: shaded ? colorText : colorMuted,
		});
	}
	// Header bottom border + panel right border
	page.drawLine({
		start: { x: panelX, y: pdfY(HEADER_HEIGHT) },
		end: { x: panelX + PANEL_WIDTH, y: pdfY(HEADER_HEIGHT) },
		thickness: 1,
		color: colorBorder,
	});
	page.drawLine({
		start: { x: panelX + PANEL_WIDTH, y: boardTop },
		end: { x: panelX + PANEL_WIDTH, y: pdfY(contentHeight) },
		thickness: 1,
		color: colorBorder,
	});

	// Rows: Item wraps (bold for Groups), Assignee wraps, dates are centered.
	for (let i = 0; i < pageRows.length; i++) {
		const row = pageRows[i];
		if (!row) continue;
		const { line } = row;
		const rowH = rowHeightFor(line, row.depth);
		const rowTopSvg = tops[i] ?? HEADER_HEIGHT;
		const rowCenter = pdfY(rowTopSvg + rowH / 2);

		const drawCell = (
			text: string,
			widthPt: number,
			fontSize: number,
			x: number,
			font: PDFFont,
			color: typeof colorText,
		) => {
			const lines = wrapText(text, widthPt, fontSize);
			const blockH = lines.length * LINE_HEIGHT;
			let baseline = rowCenter + blockH / 2 - fontSize * 0.8;
			for (const l of lines) {
				page.drawText(l, { x, y: baseline, size: fontSize, font, color });
				baseline -= LINE_HEIGHT;
			}
		};

		drawCell(
			line.item,
			ITEM_COL_WIDTH - CELL_PAD * 2 - row.depth * INDENT_PX,
			ROW_TEXT_FONT_SIZE,
			panelX + CELL_PAD + row.depth * INDENT_PX,
			line.isGroup ? ctx.fontBold : ctx.font,
			colorText,
		);
		drawCell(
			line.assignee ?? "",
			ASSIGNEE_COL_WIDTH - CELL_PAD * 2,
			ASSIGNEE_FONT_SIZE,
			panelX + ITEM_COL_WIDTH + CELL_PAD,
			ctx.font,
			colorText,
		);

		// Dates are left-aligned with padding; End column uses darker text on shading
		for (const [date, colOffset, shaded] of [
			[line.startDate, ITEM_COL_WIDTH + ASSIGNEE_COL_WIDTH, false],
			[line.endDate, ITEM_COL_WIDTH + ASSIGNEE_COL_WIDTH + DATE_COL_WIDTH, true],
		] as const) {
			page.drawText(date, {
				x: panelX + colOffset + CELL_PAD,
				y: rowCenter - DATE_FONT_SIZE * 0.35,
				size: DATE_FONT_SIZE,
				font: ctx.font,
				color: shaded ? colorText : colorMuted,
			});
		}
	}
}

function drawTimeline(
	ctx: PageCtx,
	project: PdfProject,
	pageRows: Array<BoardRow<PdfBoardLine>>,
	tops: number[],
) {
	const { page, layout, boardTop } = ctx;
	const { geom, timelineWidth } = layout;
	const colorMuted = hexColor(COLOR_MUTED);
	const colorBorder = hexColor(COLOR_BORDER);
	const pdfY = (svgY: number) => boardTop - svgY;
	const tx = (x: number) => PAGE_MARGIN + PANEL_WIDTH + x;

	const lastRow = pageRows[pageRows.length - 1];
	const height = lastRow
		? (tops[pageRows.length - 1] ?? HEADER_HEIGHT) +
			rowHeightFor(lastRow.line, lastRow.depth)
		: HEADER_HEIGHT;

	// Weekend shading (calendar days — shaded, not excluded)
	for (const span of weekendSpans(geom)) {
		page.drawRectangle({
			x: tx(span.x),
			y: pdfY(height),
			width: span.width,
			height,
			color: hexColor(COLOR_WEEKEND),
		});
	}

	// Tick gridlines
	const ticks = ticksFor(geom);
	for (const tick of ticks) {
		page.drawLine({
			start: { x: tx(tick.x), y: pdfY(HEADER_HEIGHT - 16) },
			end: { x: tx(tick.x), y: pdfY(height) },
			thickness: 1,
			color: colorBorder,
			opacity: tick.major ? 0.9 : 0.35,
		});
	}

	// Row separators (panel + timeline, one continuous line each)
	for (let i = 0; i < pageRows.length; i++) {
		const row = pageRows[i];
		if (!row) continue;
		const sepY = pdfY(
			(tops[i] ?? HEADER_HEIGHT) + rowHeightFor(row.line, row.depth),
		);
		page.drawLine({
			start: { x: PAGE_MARGIN, y: sepY },
			end: { x: PAGE_MARGIN + PANEL_WIDTH + timelineWidth, y: sepY },
			thickness: 0.5,
			color: colorBorder,
			opacity: 0.5,
		});
	}

	// Bars, milestone diamonds, group summary bars, notes
	for (let i = 0; i < pageRows.length; i++) {
		const row = pageRows[i];
		if (!row) continue;
		const { line } = row;
		const bar = barForLine(geom, line);
		const color = hexColor(assigneeColor(line.assignee, project.colorPalette));
		const rowH = rowHeightFor(line, row.depth);
		const cy = (tops[i] ?? HEADER_HEIGHT) + rowH / 2; // svgY of row center
		const note = line.note ?? null;
		const percentComplete = line.percentComplete ?? 0;

		if (line.isGroup) {
			// Summary bar + caps are 12pt tall total; centering keeps the caps
			// inside the thinner paper rows.
			const capTop = cy - 6;
			const barX = bar.x + BAR_INSET;
			const barW = Math.max(bar.width - BAR_INSET * 2, 2);
			page.drawSvgPath(
				roundedRectPath(barX, capTop, barW, 6, 1.5),
				{ x: PAGE_MARGIN + PANEL_WIDTH, y: boardTop, color, opacity: 0.9 },
			);
			const caps = groupCapPaths(bar.x, bar.width, capTop);
			page.drawSvgPath(caps.left, {
				x: PAGE_MARGIN + PANEL_WIDTH,
				y: boardTop,
				color,
			});
			page.drawSvgPath(caps.right, {
				x: PAGE_MARGIN + PANEL_WIDTH,
				y: boardTop,
				color,
			});
			if (note) {
				page.drawText(truncate(note, bar.width - 12), {
					x: tx(bar.x + 6),
					y: pdfY(cy + 2.5),
					size: NOTE_FONT_SIZE,
					font: ctx.font,
					color: rgb(1, 1, 1),
				});
			}
			continue;
		}

		if (bar.isMilestone) {
			page.drawSvgPath(pdfDiamondPath(bar.x, cy), {
				x: PAGE_MARGIN + PANEL_WIDTH,
				y: boardTop,
				color,
			});
			if (note) {
				// The Board gives milestone notes a 192px column
				page.drawText(truncate(note, 192), {
					x: tx(bar.x + PDF_DIAMOND_SIZE + 4),
					y: pdfY(cy + 2.5),
					size: NOTE_FONT_SIZE,
					font: ctx.font,
					color: colorMuted,
				});
			}
			continue;
		}

		const barX = bar.x + BAR_INSET;
		const barW = Math.max(bar.width - BAR_INSET * 2, 2);
		// Bars keep the compact height and center within the (possibly wrapped,
		// taller) row.
		const barH = PDF_ROW_HEIGHT - BAR_PAD * 2;
		const barTopSvg = cy - barH / 2;
		page.drawSvgPath(
			roundedRectPath(barX, barTopSvg, barW, barH, BAR_RADIUS),
			{ x: PAGE_MARGIN + PANEL_WIDTH, y: boardTop, color, opacity: 0.85 },
		);
		if (percentComplete > 0) {
			page.drawSvgPath(
				roundedRectPath(
					barX,
					barTopSvg,
					(barW * percentComplete) / 100,
					barH,
					BAR_RADIUS,
				),
				{ x: PAGE_MARGIN + PANEL_WIDTH, y: boardTop, color: rgb(0, 0, 0), opacity: 0.35 },
			);
		}
		if (note) {
			page.drawText(truncate(note, barW - 12), {
				x: tx(barX + 6),
				y: pdfY(cy + 2.5),
				size: NOTE_FONT_SIZE,
				font: ctx.font,
				color: rgb(1, 1, 1),
			});
		}
	}

	// Axis labels on top (drawn last, like the Board)
	for (const tick of ticks) {
		page.drawText(tick.label, {
			x: tx(tick.x + 4),
			y: pdfY(HEADER_HEIGHT - 20),
			size: TICK_FONT_SIZE,
			font: tick.major ? ctx.fontBold : ctx.font,
			color: colorMuted,
		});
	}
}

function drawFooter(
	ctx: PageCtx,
	project: PdfProject,
	generated: string,
	pageIndex: number,
	totalPages: number,
	contentBottom: number,
) {
	const { page } = ctx;
	const text = `${project.name} · exported ${generated} · page ${pageIndex + 1} of ${totalPages}`;
	const width = ctx.font.widthOfTextAtSize(text, 8);
	page.drawText(text, {
		x: page.getWidth() - PAGE_MARGIN - width,
		y: contentBottom - 16,
		size: 8,
		font: ctx.font,
		color: hexColor(COLOR_MUTED),
	});
}

// ---------------------------------------------------------------------------
// Entry point

/** Renders a Project's Board to PDF bytes; shared by the authenticated
 * exportPdf and the public exportPdfByToken procedures. */
export async function renderBoardPdf(
	project: PdfProject,
	lines: PdfBoardLine[],
	pageSize: PdfPageSize,
	options?: { orgLogoUrl?: string; generatedAt?: Date },
): Promise<{ filename: string; data: Uint8Array }> {
	const window = deriveWindow(lines, project);
	const rows = buildRows(lines);
	const layout = pdfLayout(pageSize, window);
	const pages = paginateRows(rows, bodyRowSpace(pageSize));
	const generated = (options?.generatedAt ?? new Date())
		.toISOString()
		.slice(0, 10);

	const doc = await PDFDocument.create();
	doc.setTitle(`${project.name} — Board`);
	doc.setProducer("projection");
	doc.setCreator("projection");

	const font = doc.embedStandardFont(StandardFonts.Helvetica);
	const fontBold = doc.embedStandardFont(StandardFonts.HelveticaBold);
	const logo = options?.orgLogoUrl
		? await embedOrgLogo(doc, options.orgLogoUrl)
		: undefined;

	for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
		const pageRows = pages[pageIndex];
		if (!pageRows) continue;
		const page = doc.addPage([layout.pageWidth, layout.pageHeight]);
		const contentTop = layout.pageHeight - PAGE_MARGIN;
		const boardTop = contentTop - TITLE_BLOCK_HEIGHT;
		const ctx: PageCtx = { page, layout, boardTop, font, fontBold, logo };

		drawTitleBlock(ctx, project, contentTop);
		drawLogo(ctx);

		const tops = rowTops(pageRows);
		drawTimeline(ctx, project, pageRows, tops);
		drawPanel(ctx, pageRows, tops);

		// Board container borders (top + bottom, full width)
		const lastRow = pageRows[pageRows.length - 1];
		const contentHeight = lastRow
			? (tops[pageRows.length - 1] ?? HEADER_HEIGHT) +
				rowHeightFor(lastRow.line, lastRow.depth)
			: HEADER_HEIGHT;
		const colorBorder = hexColor(COLOR_BORDER);
		const right = PAGE_MARGIN + PANEL_WIDTH + layout.timelineWidth;
		page.drawLine({
			start: { x: PAGE_MARGIN, y: boardTop },
			end: { x: right, y: boardTop },
			thickness: 1,
			color: colorBorder,
		});
		page.drawLine({
			start: { x: PAGE_MARGIN, y: boardTop - contentHeight },
			end: { x: right, y: boardTop - contentHeight },
			thickness: 1,
			color: colorBorder,
		});

		drawFooter(
			ctx,
			project,
			generated,
			pageIndex,
			pages.length,
			boardTop - contentHeight,
		);
	}

	const bytes = await doc.save();
	const slug =
		project.name
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/(^-|-$)/g, "") || "board";
	return {
		filename: `${slug}-${pageSize.toLowerCase()}.pdf`,
		data: bytes,
	};
}
