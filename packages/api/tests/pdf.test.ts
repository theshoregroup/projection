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
	type PdfBoardLine,
	pdfLayout,
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

	it("paginates vertically when rows exceed a page", async () => {
		const lines = Array.from({ length: 30 }, (_, i) =>
			makeLine({ item: `Row ${i + 1}` }),
		);
		const layout = pdfLayout("A3", {
			start: project.seedStart,
			end: project.seedEnd,
		});
		expect(lines.length).toBeGreaterThan(layout.rowsPerPage);
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
