import { describe, expect, it } from "vitest";
import {
	addDays,
	deriveWindow,
	diffDays,
	isIsoDate,
	isValidRange,
} from "../src/domain/dates";
import {
	SORT_GAP,
	sortOrderAtEnd,
	sortOrderBetween,
} from "../src/domain/ordering";
import { canEdit, canManage, roleFor } from "../src/domain/permissions";

describe("isIsoDate", () => {
	it("accepts YYYY-MM-DD", () => {
		expect(isIsoDate("2026-07-29")).toBe(true);
	});
	it("rejects other shapes", () => {
		expect(isIsoDate("29/07/2026")).toBe(false);
		expect(isIsoDate("2026-7-9")).toBe(false);
		expect(isIsoDate("2026-07-29T10:00:00Z")).toBe(false);
	});
});

describe("isValidRange", () => {
	it("allows equal dates (single day, e.g. a Milestone)", () => {
		expect(isValidRange("2026-07-29", "2026-07-29")).toBe(true);
	});
	it("rejects End before Start", () => {
		expect(isValidRange("2026-07-29", "2026-07-01")).toBe(false);
	});
});

describe("deriveWindow", () => {
	const seed = { seedStart: "2026-03-01", seedEnd: "2026-06-30" };

	it("falls back to the seed dates when the Project has no Lines", () => {
		expect(deriveWindow([], seed)).toEqual({
			start: "2026-03-01",
			end: "2026-06-30",
		});
	});

	it("keeps the seeds when every Line sits inside them", () => {
		const lines = [{ startDate: "2026-03-10", endDate: "2026-04-01" }];
		expect(deriveWindow(lines, seed)).toEqual({
			start: "2026-03-01",
			end: "2026-06-30",
		});
	});

	it("auto-expands to fit Lines outside the seeds and never clamps them", () => {
		const lines = [
			{ startDate: "2026-02-14", endDate: "2026-04-01" },
			{ startDate: "2026-05-01", endDate: "2026-09-15" },
		];
		expect(deriveWindow(lines, seed)).toEqual({
			start: "2026-02-14",
			end: "2026-09-15",
		});
	});
});

describe("addDays / diffDays", () => {
	it("crosses month boundaries", () => {
		expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
	});
	it("handles negative shifts and leap years", () => {
		expect(addDays("2024-03-01", -1)).toBe("2024-02-29");
		expect(diffDays("2024-02-28", "2024-03-01")).toBe(2);
	});
});

describe("sortOrderAtEnd", () => {
	it("starts at one gap when empty", () => {
		expect(sortOrderAtEnd([])).toBe(SORT_GAP);
	});
	it("appends a full gap after the maximum", () => {
		expect(sortOrderAtEnd([SORT_GAP, SORT_GAP * 3, SORT_GAP * 2])).toBe(
			SORT_GAP * 4,
		);
	});
});

describe("sortOrderBetween", () => {
	it("handles an empty board", () => {
		expect(sortOrderBetween(null, null)).toBe(SORT_GAP);
	});
	it("moves to the end", () => {
		expect(sortOrderBetween(2048, null)).toBe(2048 + SORT_GAP);
	});
	it("moves to the start", () => {
		expect(sortOrderBetween(null, 1024)).toBe(0);
	});
	it("takes the midpoint between neighbours", () => {
		expect(sortOrderBetween(1024, 2048)).toBe(1536);
	});
});

describe("roleFor", () => {
	const proj = { ownerId: "owner-1" };

	it("Owner", () => {
		expect(roleFor("owner-1", proj, [])).toBe("owner");
	});
	it("active Editor", () => {
		const editors = [{ userId: "user-2", status: "active" }];
		expect(roleFor("user-2", proj, editors)).toBe("editor");
	});
	it("Pending Invite is not an Editor yet", () => {
		const editors = [{ userId: null, status: "pending" }];
		expect(roleFor("user-2", proj, editors)).toBeNull();
	});
	it("a userId with pending status still gets no access", () => {
		const editors = [{ userId: "user-2", status: "pending" }];
		expect(roleFor("user-2", proj, editors)).toBeNull();
	});
	it("outsider (including Admins — they get no project access, ADR 0004)", () => {
		expect(roleFor("admin-9", proj, [])).toBeNull();
	});
});

describe("powers", () => {
	it("Owner can edit and manage", () => {
		expect(canEdit("owner")).toBe(true);
		expect(canManage("owner")).toBe(true);
	});
	it("Editor can edit content but not membership", () => {
		expect(canEdit("editor")).toBe(true);
		expect(canManage("editor")).toBe(false);
	});
});
