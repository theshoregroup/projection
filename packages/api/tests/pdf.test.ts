import { createElement, type ReactElement } from "react";

/** renderToBuffer wants a DocumentProps element; our component returns one,
 * so the cast is type-level only. */
const asDocument = (el: ReactElement) =>
	el as unknown as Parameters<typeof renderToBuffer>[0];

import { renderToBuffer } from "@react-pdf/renderer";
import { describe, expect, it } from "vitest";
import { tickUnitFor } from "../src/domain/geometry";
import {
	BoardPdfDocument,
	bodyRowSpace,
	type PdfBoardLine,
	paginateRows,
	pdfLayout,
	rowHeightFor,
	textLines,
} from "../src/pdf/board-pdf";

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
	seedStart: "2026-03-01",
	seedEnd: "2026-03-31",
};

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
});

describe("BoardPdfDocument", () => {
	it("renders bars, milestones and groups to a PDF buffer", async () => {
		const lines = [
			makeLine({ item: "Design", assignee: "Liam", percentComplete: 40 }),
			makeLine({
				item: "Launch",
				isMilestone: true,
				startDate: "2026-03-20",
				endDate: "2026-03-20",
			}),
		];
		const group = makeLine({
			item: "Build",
			isGroup: true,
			assignee: "Matt",
		});
		const child = makeLine({
			item: "Homepage",
			groupId: group.id,
			note: "Hero animation",
			percentComplete: 25,
		});
		const first = lines[0];
		const second = lines[1];
		if (!first || !second) throw new Error("fixture");
		const buffer = await renderToBuffer(
			asDocument(
				createElement(BoardPdfDocument, {
					project,
					lines: [first, second, group, child],
					pageSize: "A3",
					generatedAt: new Date("2026-08-24T00:00:00Z"),
				}),
			),
		);
		expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
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
		const buffer = await renderToBuffer(
			asDocument(
				createElement(BoardPdfDocument, {
					project,
					lines,
					pageSize: "A3",
				}),
			),
		);
		expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
		// Page count is embedded in the PDF's page tree
		const counts = buffer.toString("latin1").match(/\/Count (\d+)/g);
		expect(counts).toContain(
			`/Count ${Math.ceil(lines.length / layout.rowsPerPage)}`,
		);
	});

	it("exports an empty project as a single page", async () => {
		const buffer = await renderToBuffer(
			asDocument(
				createElement(BoardPdfDocument, {
					project,
					lines: [],
					pageSize: "A2",
				}),
			),
		);
		expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
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

	it("a board with a very long title still exports", async () => {
		const lines = [makeLine({ item: "x".repeat(300) })];
		const buffer = await renderToBuffer(
			asDocument(
				createElement(BoardPdfDocument, {
					project,
					lines,
					pageSize: "A3",
				}),
			),
		);
		expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
	});
});
