import { describe, expect, it } from "vitest";
import {
	addDays,
	deriveWindow,
	diffDays,
	isIsoDate,
	isValidRange,
} from "../src/domain/dates";
import {
	applyDerivedGroupDates,
	buildRows,
	descendantIds,
	expandWithDescendants,
	type GroupableLine,
	isDescendantOf,
	normalizeSelection,
} from "../src/domain/groups";
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

// --- Groups ---------------------------------------------------------------

let groupSeq = 0;
function stubLine(
	partial: Partial<GroupableLine> & { id: string },
): GroupableLine {
	groupSeq += 1;
	return {
		isGroup: false,
		groupId: null,
		startDate: "2026-03-10",
		endDate: "2026-03-20",
		sortOrder: groupSeq * 1024,
		...partial,
	};
}

describe("buildRows", () => {
	it("flattens depth-first with siblings in sortOrder", () => {
		const lines = [
			stubLine({ id: "a", sortOrder: 1 }),
			stubLine({ id: "g", isGroup: true, sortOrder: 2 }),
			stubLine({ id: "b", groupId: "g", sortOrder: 1 }),
			stubLine({ id: "c", groupId: "g", sortOrder: 2 }),
			stubLine({ id: "d", sortOrder: 3 }),
		];
		const rows = buildRows(lines);
		expect(rows.map((row) => row.line.id)).toEqual(["a", "g", "b", "c", "d"]);
		expect(rows.map((row) => row.depth)).toEqual([0, 0, 1, 1, 0]);
		expect(rows.map((row) => row.parentId)).toEqual([
			null,
			null,
			"g",
			"g",
			null,
		]);
	});

	it("nests groups", () => {
		const lines = [
			stubLine({ id: "outer", isGroup: true }),
			stubLine({ id: "inner", isGroup: true, groupId: "outer" }),
			stubLine({ id: "leaf", groupId: "inner" }),
		];
		const rows = buildRows(lines);
		expect(rows.map((row) => row.line.id)).toEqual(["outer", "inner", "leaf"]);
		expect(rows.map((row) => row.depth)).toEqual([0, 1, 2]);
	});

	it("surfaces orphans (dangling groupId) at the top level", () => {
		const lines = [stubLine({ id: "a", groupId: "gone" })];
		const rows = buildRows(lines);
		expect(rows).toEqual([{ line: lines[0], depth: 0, parentId: null }]);
	});

	it("treats a non-group groupId target as top level", () => {
		const lines = [stubLine({ id: "a" }), stubLine({ id: "b", groupId: "a" })];
		const rows = buildRows(lines);
		expect(rows.map((row) => row.depth)).toEqual([0, 0]);
	});

	it("breaks cycles instead of recursing forever", () => {
		const lines = [
			stubLine({ id: "g1", isGroup: true, groupId: "g2" }),
			stubLine({ id: "g2", isGroup: true, groupId: "g1" }),
		];
		const rows = buildRows(lines);
		expect(rows.map((row) => row.line.id).sort()).toEqual(["g1", "g2"]);
	});
});

describe("applyDerivedGroupDates", () => {
	it("derives Start as the earliest child Start and End as the latest child End", () => {
		const lines = [
			stubLine({
				id: "g",
				isGroup: true,
				startDate: "2026-01-01",
				endDate: "2026-01-02",
			}),
			stubLine({
				id: "a",
				groupId: "g",
				startDate: "2026-03-05",
				endDate: "2026-03-10",
			}),
			stubLine({
				id: "b",
				groupId: "g",
				startDate: "2026-03-08",
				endDate: "2026-04-15",
			}),
		];
		const derived = applyDerivedGroupDates(lines);
		const group = derived.find((row) => row.id === "g") as GroupableLine;
		expect(group.startDate).toBe("2026-03-05");
		expect(group.endDate).toBe("2026-04-15");
	});

	it("rolls up nested groups", () => {
		const lines = [
			stubLine({ id: "outer", isGroup: true }),
			stubLine({ id: "inner", isGroup: true, groupId: "outer" }),
			stubLine({
				id: "leaf",
				groupId: "inner",
				startDate: "2026-05-01",
				endDate: "2026-05-09",
			}),
		];
		const derived = applyDerivedGroupDates(lines);
		for (const id of ["outer", "inner"]) {
			const group = derived.find((row) => row.id === id) as GroupableLine;
			expect(group.startDate).toBe("2026-05-01");
			expect(group.endDate).toBe("2026-05-09");
		}
	});

	it("keeps stored dates on empty groups", () => {
		const lines = [
			stubLine({
				id: "g",
				isGroup: true,
				startDate: "2026-02-01",
				endDate: "2026-02-10",
			}),
		];
		const group = applyDerivedGroupDates(lines)[0] as GroupableLine;
		expect(group.startDate).toBe("2026-02-01");
		expect(group.endDate).toBe("2026-02-10");
	});

	it("leaves plain lines untouched and preserves order", () => {
		const lines = [
			stubLine({ id: "a", startDate: "2026-03-01", endDate: "2026-03-02" }),
			stubLine({ id: "g", isGroup: true }),
			stubLine({ id: "b", groupId: "g" }),
		];
		const derived = applyDerivedGroupDates(lines);
		expect(derived.map((row) => row.id)).toEqual(["a", "g", "b"]);
		expect(derived[0]).toEqual(lines[0]);
	});
});

describe("descendantIds / isDescendantOf", () => {
	const lines = [
		stubLine({ id: "outer", isGroup: true }),
		stubLine({ id: "inner", isGroup: true, groupId: "outer" }),
		stubLine({ id: "leaf", groupId: "inner" }),
		stubLine({ id: "loose" }),
	];

	it("collects descendants at any depth", () => {
		expect([...descendantIds(lines, "outer")].sort()).toEqual([
			"inner",
			"leaf",
		]);
		expect(isDescendantOf(lines, "outer", "leaf")).toBe(true);
		expect(isDescendantOf(lines, "outer", "loose")).toBe(false);
		expect(isDescendantOf(lines, "inner", "outer")).toBe(false);
	});
});

describe("normalizeSelection", () => {
	const lines = [
		stubLine({ id: "g", isGroup: true }),
		stubLine({ id: "a", groupId: "g" }),
		stubLine({ id: "b", groupId: "g" }),
		stubLine({ id: "c" }),
	];

	it("drops rows whose ancestor is also selected", () => {
		expect(normalizeSelection(lines, ["g", "a", "c"])).toEqual(["g", "c"]);
	});

	it("keeps plain rows and drops unknown ids", () => {
		expect(normalizeSelection(lines, ["a", "b", "nope"])).toEqual(["a", "b"]);
	});
});

describe("expandWithDescendants", () => {
	it("adds every descendant of selected groups", () => {
		const lines = [
			stubLine({ id: "g", isGroup: true }),
			stubLine({ id: "sub", isGroup: true, groupId: "g" }),
			stubLine({ id: "a", groupId: "sub" }),
			stubLine({ id: "b" }),
		];
		expect([...expandWithDescendants(lines, ["g", "b"])].sort()).toEqual([
			"a",
			"b",
			"g",
			"sub",
		]);
	});
});
