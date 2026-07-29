import { describe, expect, it } from "vitest";
import { assigneeColor } from "../src/lib/board-layout/colors";
import {
	barForLine,
	boardHeight,
	boardWidth,
	DEFAULT_DAY_WIDTH,
	dateToX,
	HEADER_HEIGHT,
	ROW_HEIGHT,
	rowY,
	ticksFor,
	tickUnitFor,
	totalDays,
	weekendSpans,
	xToDate,
} from "../src/lib/board-layout/geometry";

const g = { start: "2026-03-01", end: "2026-03-31", dayWidth: 24 };

describe("window basics", () => {
	it("counts days inclusively", () => {
		expect(totalDays(g)).toBe(31);
		expect(boardWidth(g)).toBe(31 * 24);
	});
	it("row layout", () => {
		expect(rowY(0)).toBe(HEADER_HEIGHT);
		expect(rowY(2)).toBe(HEADER_HEIGHT + 2 * ROW_HEIGHT);
		expect(boardHeight(3)).toBe(HEADER_HEIGHT + 3 * ROW_HEIGHT);
		expect(boardHeight(0)).toBe(HEADER_HEIGHT + ROW_HEIGHT); // one empty row minimum
	});
});

describe("dateToX / xToDate", () => {
	it("window start maps to 0", () => {
		expect(dateToX(g, "2026-03-01")).toBe(0);
	});
	it("round-trips", () => {
		expect(xToDate(g, dateToX(g, "2026-03-17"))).toBe("2026-03-17");
	});
});

describe("barForLine", () => {
	it("a bar spans Start through End inclusively", () => {
		const bar = barForLine(g, {
			startDate: "2026-03-10",
			endDate: "2026-03-12",
			isMilestone: false,
		});
		expect(bar.x).toBe(9 * 24);
		expect(bar.width).toBe(3 * 24);
	});
	it("a Milestone occupies a single day and centers its diamond", () => {
		const bar = barForLine(g, {
			startDate: "2026-03-10",
			endDate: "2026-03-10",
			isMilestone: true,
		});
		expect(bar.width).toBe(0);
		expect(bar.x).toBe(9 * 24 + 12);
	});
});

describe("ticks", () => {
	it("zooms: day, week, month", () => {
		expect(tickUnitFor(DEFAULT_DAY_WIDTH)).toBe("week");
		expect(tickUnitFor(40)).toBe("day");
		expect(tickUnitFor(10)).toBe("week");
		expect(tickUnitFor(4)).toBe("month");
	});
	it("day ticks mark month boundaries as major", () => {
		const dayG = { start: "2026-02-27", end: "2026-03-05", dayWidth: 40 };
		const ticks = ticksFor(dayG);
		expect(ticks).toHaveLength(7);
		expect(ticks.find((t) => t.date === "2026-03-01")?.major).toBe(true);
		expect(ticks.find((t) => t.date === "2026-03-02")?.major).toBe(false);
	});
	it("week ticks land on Mondays", () => {
		const ticks = ticksFor(g);
		expect(ticks.length).toBeGreaterThan(0);
		for (const tick of ticks.slice(1)) {
			expect(new Date(`${tick.date}T00:00:00.000Z`).getUTCDay()).toBe(1);
		}
	});
	it("month ticks land on the 1st", () => {
		const monthG = { start: "2026-01-15", end: "2026-06-15", dayWidth: 4 };
		const ticks = ticksFor(monthG);
		expect(ticks[0].date).toBe("2026-01-15"); // first day always ticks
		expect(ticks.slice(1).every((t) => t.date.endsWith("-01"))).toBe(true);
		expect(ticks[1].label).toBe("Feb 2026");
	});
});

describe("weekendSpans", () => {
	it("shades Saturdays and Sundays only", () => {
		const weekG = { start: "2026-07-27", end: "2026-08-02", dayWidth: 10 }; // Mon–Sun
		const spans = weekendSpans(weekG);
		expect(spans).toHaveLength(2);
		expect(spans[0]).toEqual({ x: 5 * 10, width: 10 }); // Saturday Aug 1
		expect(spans[1]).toEqual({ x: 6 * 10, width: 10 }); // Sunday Aug 2
	});
});

describe("assigneeColor", () => {
	it("is deterministic per person (case/whitespace-insensitive)", () => {
		expect(assigneeColor("Liam")).toBe(assigneeColor(" liam "));
	});
	it("differs across people and falls back to gray when unassigned", () => {
		expect(assigneeColor("Liam")).not.toBe(assigneeColor("Matt"));
		expect(assigneeColor(null)).toBe("#6b7280");
		expect(assigneeColor("  ")).toBe("#6b7280");
	});
});
