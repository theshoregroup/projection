import {
	decodePDFRawStream,
	PDFArray,
	PDFDocument,
	PDFRawStream,
} from "pdf-lib";
import { describe, expect, it } from "vitest";
import { assigneeColor } from "../src/domain/colors";
import { deriveWindow } from "../src/domain/dates";
import { HEADER_HEIGHT, tickUnitFor } from "../src/domain/geometry";
import { buildRows } from "../src/domain/groups";
import {
	BAR_PAD,
	bodyRowSpace,
	PAGE_MARGIN,
	PDF_PAGE_SIZES,
	PDF_ROW_HEIGHT,
	type PdfBoardLine,
	paginateRows,
	pdfLayout,
	rowHeightFor,
	rowTops,
	TITLE_BLOCK_HEIGHT,
	textLines,
	wrapText,
} from "../src/pdf/layout";
import { flipSvgPathY, renderBoardPdf } from "../src/pdf/render";

let seq = 0;
function makeLine(partial: Partial<PdfBoardLine>): PdfBoardLine {
	seq += 1;
	return {
		id: `line-${seq}`,
		isGroup: false,
		groupId: null,
		startDate: "2026-03-10",
		endDate: "2026-03-12",
		sortOrder: seq,
		item: `Line ${seq}`,
		assignee: null,
		note: null,
		percentComplete: 0,
		isMilestone: false,
		...partial,
	};
}

const project = {
	id: "proj-1",
	name: "Website relaunch",
	description: "Marketing site rebuild",
	seedStart: "2026-03-01" as const,
	seedEnd: "2026-03-31" as const,
	colorPalette: "catppuccin",
};

// ---------------------------------------------------------------------------
// Test helpers: crack a rendered PDF back open and read what landed inside.

/** All page content streams, decoded (pdf-lib Flate-compresses them). */
async function contentStreams(data: Uint8Array): Promise<string[]> {
	const doc = await PDFDocument.load(data);
	return doc.getPages().map((page) => {
		const contents = page.node.Contents();
		const extract = (node: unknown): string => {
			if (node instanceof PDFRawStream) {
				return Buffer.from(decodePDFRawStream(node).decode()).toString(
					"latin1",
				);
			}
			if (node instanceof PDFArray) {
				let out = "";
				for (let i = 0; i < node.size(); i++) out += extract(node.lookup(i));
				return out;
			}
			return "";
		};
		return extract(contents);
	});
}

/** pdf-lib writes text as hex strings (`<48656C6C6F> Tj`); decode them back
 * to the latin1/WinAnsi text the fixtures use. */
function drawnText(contentStream: string): string {
	const parts: string[] = [];
	for (const match of contentStream.matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)) {
		if (match[1]) parts.push(Buffer.from(match[1], "hex").toString("latin1"));
	}
	return parts.join("\n");
}

/** #rrggbb → the [r, g, b] triple (0–1) pdf-lib's `rg`/`RG` operators use. */
function hexToRgbTriple(hex: string): [number, number, number] {
	const h = hex.replace("#", "");
	return [
		Number.parseInt(h.slice(0, 2), 16) / 255,
		Number.parseInt(h.slice(2, 4), 16) / 255,
		Number.parseInt(h.slice(4, 6), 16) / 255,
	];
}

/** Every top-level `q ... Q` graphics-state block in a content stream, as
 * raw operator text — pdf-lib wraps each shape it draws in exactly one such
 * block, never nested, so this cleanly isolates one drawn shape at a time. */
function qBlocks(content: string): string[] {
	const blocks: string[] = [];
	const re = /(?:^|\n)q\n([\s\S]*?)\nQ(?:\n|$)/g;
	for (const match of content.matchAll(re)) {
		if (match[1] !== undefined) blocks.push(match[1]);
	}
	return blocks;
}

/** Does this block set the fill color to (approximately) this RGB triple? */
function blockFillsWith(
	block: string,
	[r, g, b]: [number, number, number],
): boolean {
	for (const match of block.matchAll(
		/(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) rg\b/g,
	)) {
		const [, mr, mg, mb] = match;
		if (
			Math.abs(Number(mr) - r) < 1e-6 &&
			Math.abs(Number(mg) - g) < 1e-6 &&
			Math.abs(Number(mb) - b) < 1e-6
		) {
			return true;
		}
	}
	return false;
}

/** Replays a single `q ... Q` block's `cm`/`m`/`l`/`c` operators (starting
 * from the identity matrix, since pdf-lib always leaves the CTM at identity
 * between top-level blocks) and returns every path point in *device* space
 * — i.e. where it actually lands on the page, exactly as a PDF viewer would
 * place it. This is what lets a test tell "drawn, but off-page" apart from
 * "drawn where the layout said to". */
function blockPointsDeviceSpace(
	block: string,
): Array<{ x: number; y: number }> {
	type Matrix = [number, number, number, number, number, number];
	const tokens = block.match(/-?\d*\.?\d+(?:[eE]-?\d+)?|[A-Za-z]+\*?/g) ?? [];
	let ctm: Matrix = [1, 0, 0, 1, 0, 0];
	const nums: number[] = [];
	const points: Array<{ x: number; y: number }> = [];

	const multiply = (m: Matrix, c: Matrix): Matrix => {
		const [a, b, cc, d, e, f] = m;
		const [a2, b2, c2, d2, e2, f2] = c;
		return [
			a * a2 + b * c2,
			a * b2 + b * d2,
			cc * a2 + d * c2,
			cc * b2 + d * d2,
			e * a2 + f * c2 + e2,
			e * b2 + f * d2 + f2,
		];
	};
	const apply = (m: Matrix, x: number, y: number) => ({
		x: m[0] * x + m[2] * y + m[4],
		y: m[1] * x + m[3] * y + m[5],
	});

	for (const tok of tokens) {
		if (/^-?\d/.test(tok)) {
			nums.push(Number(tok));
			continue;
		}
		switch (tok) {
			case "cm": {
				const args = nums.splice(-6) as unknown as Matrix;
				if (args.length === 6) ctm = multiply(args, ctm);
				break;
			}
			case "m":
			case "l": {
				const [x, y] = nums.splice(-2);
				if (x !== undefined && y !== undefined) points.push(apply(ctm, x, y));
				break;
			}
			case "c": {
				const args = nums.splice(-6);
				if (args.length === 6) {
					const [x1, y1, x2, y2, x3, y3] = args as number[];
					points.push(apply(ctm, x1 as number, y1 as number));
					points.push(apply(ctm, x2 as number, y2 as number));
					points.push(apply(ctm, x3 as number, y3 as number));
				}
				break;
			}
			default:
				nums.length = 0;
		}
	}
	return points;
}

// ---------------------------------------------------------------------------
// Pure layout (unchanged behavior, now with a real wrap function underneath)

describe("pdfLayout scale-to-fit", () => {
	it("never exceeds the day-tick width, however large the paper", () => {
		const a0 = pdfLayout("A0", { start: "2026-03-01", end: "2026-03-05" });
		expect(a0.geom.dayWidth).toBe(28);
	});

	it("shrinks dayWidth when the window is wider than the page", () => {
		const layout = pdfLayout("A3", {
			start: "2026-01-01",
			end: "2026-12-31",
		});
		expect(layout.geom.dayWidth).toBeLessThan(24);
		// …and tick granularity follows the shrunk zoom (same rule as the Board)
		expect(tickUnitFor(layout.geom.dayWidth)).toBe("month");
	});

	it("shows day ticks when the paper has room for them", () => {
		// The Board's rule is "days when wide" (tickUnitFor >= 28): a short
		// window on A3 reaches that threshold, longer ones step down.
		const a3 = pdfLayout("A3", { start: "2026-03-01", end: "2026-03-14" });
		expect(tickUnitFor(a3.geom.dayWidth)).toBe("day");
		const a3Year = pdfLayout("A3", { start: "2026-01-01", end: "2026-12-31" });
		expect(tickUnitFor(a3Year.geom.dayWidth)).toBe("month");
	});

	it("gives larger paper more room", () => {
		const window = { start: "2026-01-01", end: "2026-12-31" };
		const a3 = pdfLayout("A3", window);
		const a0 = pdfLayout("A0", window);
		expect(a0.geom.dayWidth).toBeGreaterThan(a3.geom.dayWidth);
	});

	it("covers every supported page size", () => {
		for (const size of PDF_PAGE_SIZES) {
			const layout = pdfLayout(size, {
				start: "2026-03-01",
				end: "2026-03-31",
			});
			// Landscape: width is the longer edge
			expect(layout.pageWidth).toBeGreaterThan(layout.pageHeight);
			expect(layout.rowsPerPage).toBeGreaterThan(0);
			expect(layout.timelineWidth).toBeGreaterThan(0);
		}
	});
});

describe("wrapText", () => {
	it("keeps short text on one line", () => {
		expect(wrapText("short", 140, 8)).toEqual(["short"]);
		expect(wrapText("", 140, 8)).toEqual([""]);
	});

	it("wraps at word boundaries within the column width", () => {
		// 140pt at 8pt ≈ 33 chars/line
		const lines = wrapText(
			"alpha beta gamma delta epsilon zeta eta theta",
			140,
			8,
		);
		expect(lines.length).toBeGreaterThan(1);
		for (const line of lines) expect(line.length).toBeLessThanOrEqual(33);
		expect(lines.join(" ")).toBe(
			"alpha beta gamma delta epsilon zeta eta theta",
		);
	});

	it("hard-breaks words longer than a line", () => {
		const lines = wrapText("x".repeat(100), 140, 8);
		expect(lines).toHaveLength(4); // 33 + 33 + 33 + 1
		expect(lines[0]).toHaveLength(33);
	});

	it("is consistent with rowHeightFor: drawn lines always fit the row", () => {
		const line = makeLine({
			item: "alpha beta gamma delta epsilon zeta eta theta iota",
		});
		const drawn = wrapText(line.item, 140, 8).length;
		const height = rowHeightFor(line, 0);
		// The row must be tall enough for every drawn line (LINE_HEIGHT = 10)
		expect(height).toBeGreaterThanOrEqual(drawn * 10);
	});
});

describe("PDF row wrapping", () => {
	it("textLines counts wrapped lines at a column width", () => {
		expect(textLines("", 140, 8)).toBe(1);
		expect(textLines("short", 140, 8)).toBe(1);
		// 140pt at 8pt font ≈ 33 chars/line; 100 chars wraps to ~4 lines
		expect(textLines("x".repeat(100), 140, 8)).toBeGreaterThanOrEqual(3);
	});

	it("rowHeightFor grows for long titles, stays compact for short ones", () => {
		const short = rowHeightFor(makeLine({ item: "Short" }), 0);
		expect(short).toBe(14); // PDF_ROW_HEIGHT

		const tall = rowHeightFor(makeLine({ item: "x".repeat(200) }), 0);
		expect(tall).toBeGreaterThan(short);

		// A long Assignee also grows the row
		const longAssignee = rowHeightFor(
			makeLine({ item: "Short", assignee: "y".repeat(120) }),
			0,
		);
		expect(longAssignee).toBeGreaterThan(short);

		// Deeper nesting narrows the Item column → taller rows for same title
		const deep = rowHeightFor(makeLine({ item: "x".repeat(120) }), 3);
		const shallow = rowHeightFor(makeLine({ item: "x".repeat(120) }), 0);
		expect(deep).toBeGreaterThanOrEqual(shallow);
	});

	it("paginateRows packs by height so a tall row shrinks its page", () => {
		const space = bodyRowSpace("A3");
		// Fill most of a page with short rows, then one very tall row that
		// cannot fit in the leftover space must start a new page.
		const shortCount = Math.floor(space / 14) - 2;
		const rows = [
			...Array.from({ length: shortCount }, (_, i) => ({
				line: makeLine({ item: `Row ${i + 1}` }),
				depth: 0,
			})),
			{ line: makeLine({ item: "x".repeat(400) }), depth: 0 },
		];
		const pages = paginateRows(rows, space);
		expect(pages).toHaveLength(2);
		expect(pages[0]).toHaveLength(shortCount);
		expect(pages[1]).toHaveLength(1);
	});

	it("paginateRows always fits at least one row, however tall", () => {
		const space = bodyRowSpace("A3");
		const huge = { line: makeLine({ item: "x".repeat(5000) }), depth: 0 };
		const pages = paginateRows([huge], space);
		expect(pages).toHaveLength(1);
		expect(pages[0]).toHaveLength(1);
	});

	it("rowTops accumulates variable row heights from the header", () => {
		const rows = [
			{ line: makeLine({ item: "A" }), depth: 0 },
			{ line: makeLine({ item: "x".repeat(200) }), depth: 0 },
			{ line: makeLine({ item: "B" }), depth: 0 },
		];
		const tops = rowTops(rows);
		expect(tops[0]).toBe(44); // HEADER_HEIGHT
		const h1 = rowHeightFor(rows[1]?.line as PdfBoardLine, 0);
		expect(tops[1]).toBe(44 + 14);
		expect(tops[2]).toBe(44 + 14 + h1);
	});
});

// ---------------------------------------------------------------------------
// Coordinate flip for the shared geometry paths

describe("flipSvgPathY", () => {
	it("flips y coordinates around the board's top edge, leaving x alone", () => {
		expect(flipSvgPathY("M 10 20 L 30 40 Z", 100)).toBe("M 10 80 L 30 60 Z");
	});

	it("round-trips a group cap path through both coordinate systems", () => {
		// A symmetric diamond flipped twice is itself
		const diamond = "M 50 6 L 56 12 L 50 18 L 44 12 Z";
		expect(flipSvgPathY(flipSvgPathY(diamond, 100), 100)).toBe(diamond);
	});

	it("throws on unsupported commands so renderer drift is loud", () => {
		expect(() => flipSvgPathY("M 0 0 C 1 2 3 4 5 6", 100)).toThrow(
			/unsupported command/,
		);
	});
});

// ---------------------------------------------------------------------------
// The rendered document (spec: ADR 0001 — same layout decisions as the Board)

describe("renderBoardPdf", () => {
	it("renders bars, milestones and groups to a valid PDF", async () => {
		const lines = [
			makeLine({ item: "Design", assignee: "Liam", percentComplete: 40 }),
			makeLine({
				item: "Launch",
				isMilestone: true,
				startDate: "2026-03-20",
				endDate: "2026-03-20",
			}),
		];
		const group = makeLine({ item: "Build", isGroup: true, assignee: "Matt" });
		const child = makeLine({
			item: "Homepage",
			groupId: group.id,
			note: "Hero animation",
			percentComplete: 25,
		});
		const { filename, data } = await renderBoardPdf(
			project,
			[...lines, group, child],
			"A3",
			{ generatedAt: new Date("2026-08-24T00:00:00Z") },
		);

		// Valid PDF with the expected filename slug
		expect(Buffer.from(data.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
		expect(filename).toBe("website-relaunch-a3.pdf");

		const doc = await PDFDocument.load(data);
		expect(doc.getPageCount()).toBe(1);
		// A3 landscape
		const { width, height } = doc.getPages()[0]?.getSize() ?? {};
		expect(width).toBeCloseTo(1190.55, 1);
		expect(height).toBeCloseTo(841.89, 1);
		// Document metadata
		expect(doc.getTitle()).toBe("Website relaunch — Board");

		// The page actually drew the spec's content: project title, panel
		// headers, line items, assignees, ISO dates, notes, and the footer.
		const [stream] = await contentStreams(data);
		const text = drawnText(stream ?? "");
		expect(text).toContain("Website relaunch");
		expect(text).toContain("Marketing site rebuild");
		expect(text).toContain("Item");
		expect(text).toContain("Assignee");
		expect(text).toContain("Design");
		expect(text).toContain("Homepage");
		expect(text).toContain("Liam");
		expect(text).toContain("2026-03-10");
		expect(text).toContain("Hero animation");
		expect(text).toContain("exported 2026-08-24");
		expect(text).toContain("page 1 of 1");
		// Axis labels: March 2026 window with day ticks → "Mar 1" major label
		expect(text).toContain("Mar");

		// Both Helvetica faces are embedded and used (regular + bold for
		// titles/groups). Font descriptors live in compressed object streams,
		// but the decoded content stream references them by resource name.
		expect(stream).toMatch(/\/Helvetica-\w+ \d+ Tf/);
		expect(stream).toMatch(/\/Helvetica-Bold-\w+ \d+ Tf/);
	});

	it("draws a line's bar on the visible page, where the layout put it", async () => {
		// Bug repro: pdf-lib's drawSvgPath always flips the Y axis (it expects
		// SVG-style y-down input), but render.ts's roundedRectPath already
		// hands it real page (y-up) coordinates. The result is flipped a
		// second time and painted below the page's bottom edge -- invisible,
		// even though the content stream contains a perfectly well-formed
		// filled path.
		const line = makeLine({
			item: "Design",
			assignee: "Liam",
			percentComplete: 0,
		});
		const { data } = await renderBoardPdf(project, [line], "A3");
		const [stream] = await contentStreams(data);
		const content = stream ?? "";

		// Independent ground truth: the same public layout functions
		// renderBoardPdf itself calls to decide where this bar's row sits.
		const window = deriveWindow([line], project);
		const layout = pdfLayout("A3", window);
		const rows = buildRows([line]);
		const tops = rowTops(rows);
		const rowH = rowHeightFor(line, 0);
		const cySvg = (tops[0] ?? HEADER_HEIGHT) + rowH / 2;
		const barH = PDF_ROW_HEIGHT - BAR_PAD * 2;
		const barTopSvg = cySvg - barH / 2;
		const contentTop = layout.pageHeight - PAGE_MARGIN;
		const boardTop = contentTop - TITLE_BLOCK_HEIGHT;
		const expectedTopY = boardTop - barTopSvg;
		const expectedBottomY = boardTop - (barTopSvg + barH);

		// Find the bar's own fill block by its assignee color, and read back
		// where pdf-lib actually painted it (device space, as a viewer sees it).
		const barColor = hexToRgbTriple(
			assigneeColor(line.assignee, project.colorPalette),
		);
		const block = qBlocks(content).find((b) => blockFillsWith(b, barColor));
		expect(block).toBeDefined();
		const points = blockPointsDeviceSpace(block ?? "");
		expect(points.length).toBeGreaterThan(0);

		const ys = points.map((p) => p.y);
		const minY = Math.min(...ys);
		const maxY = Math.max(...ys);

		// The bar must land on the visible page...
		expect(minY).toBeGreaterThanOrEqual(0);
		expect(maxY).toBeLessThanOrEqual(layout.pageHeight);
		// ...specifically inside the row the layout laid it out for.
		expect(minY).toBeCloseTo(expectedBottomY, 1);
		expect(maxY).toBeCloseTo(expectedTopY, 1);
	});

	it("packs ~45 thinner rows onto an A3 landscape page", () => {
		const layout = pdfLayout("A3", {
			start: project.seedStart,
			end: project.seedEnd,
		});
		expect(layout.rowsPerPage).toBeGreaterThanOrEqual(45);
	});

	it("paginates vertically when rows exceed a page", async () => {
		const layout = pdfLayout("A3", {
			start: project.seedStart,
			end: project.seedEnd,
		});
		const lines = Array.from({ length: layout.rowsPerPage + 1 }, (_, i) =>
			makeLine({ item: `Row ${i + 1}` }),
		);
		const { data } = await renderBoardPdf(project, lines, "A3");
		const doc = await PDFDocument.load(data);
		expect(doc.getPageCount()).toBe(2);
		const streams = await contentStreams(data);
		expect(drawnText(streams[0] ?? "")).toContain("page 1 of 2");
		expect(drawnText(streams[1] ?? "")).toContain("page 2 of 2");
	});

	it("exports an empty project as a single page", async () => {
		const { data } = await renderBoardPdf(project, [], "A2");
		expect(Buffer.from(data.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
		const doc = await PDFDocument.load(data);
		expect(doc.getPageCount()).toBe(1);
		const [stream] = await contentStreams(data);
		expect(drawnText(stream ?? "")).toContain("Website relaunch");
	});

	it("a board with a very long title still exports", async () => {
		const lines = [makeLine({ item: "x".repeat(300) })];
		const { data } = await renderBoardPdf(project, lines, "A3");
		expect(Buffer.from(data.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
	});

	it("embeds the org logo when a data URI is provided", async () => {
		// 1x1 red pixel PNG
		const orgLogoUrl =
			"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
		const { data } = await renderBoardPdf(
			project,
			[makeLine({ item: "Design" })],
			"A3",
			{ orgLogoUrl },
		);
		const raw = Buffer.from(data).toString("latin1");
		expect(raw).toContain("/Image");
	});

	it("skips a broken org logo instead of failing the export", async () => {
		const { data } = await renderBoardPdf(
			project,
			[makeLine({ item: "Design" })],
			"A3",
			{ orgLogoUrl: "data:image/png;base64,not-a-real-png" },
		);
		expect(Buffer.from(data.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
		const raw = Buffer.from(data).toString("latin1");
		expect(raw).not.toContain("/Image");
	});

	it("never uses Node subpath imports (the Vercel crash class)", async () => {
		// Regression guard for '#standard-fonts/Helvetica': pdf-lib embeds
		// standard fonts from data, so rendering must not touch require().
		const { data } = await renderBoardPdf(
			project,
			[makeLine({ item: "Design" })],
			"A3",
		);
		expect(Buffer.from(data.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
	});
});
