import { buildRows, type GroupableLine } from "@projection/api/domain/groups";
import { describe, expect, it } from "vitest";
import {
	insertionGap,
	NEW_ROW_ID,
	resolveDropTarget,
} from "../src/lib/board-layout/reorder";

const lines = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];

describe("insertionGap", () => {
	it("hovering the dragged row's own spot keeps it home", () => {
		expect(insertionGap(lines, "b", 1)).toBe(1);
	});
	it("hovering a row above inserts before it", () => {
		expect(insertionGap(lines, "c", 0)).toBe(0);
		expect(insertionGap(lines, "d", 1)).toBe(1);
	});
	it("hovering a row below inserts after it", () => {
		expect(insertionGap(lines, "a", 1)).toBe(2);
		expect(insertionGap(lines, "a", 3)).toBe(4); // bottom edge of the last row
	});
});

// --- resolveDropTarget -----------------------------------------------------

let seq = 0;
function stubLine(
	partial: Partial<GroupableLine> & { id: string },
): GroupableLine {
	seq += 1;
	return {
		isGroup: false,
		groupId: null,
		startDate: "2026-03-10",
		endDate: "2026-03-20",
		sortOrder: seq * 1024,
		...partial,
	};
}

/**
 *  top1
 *  grp            (group)
 *    child1
 *    inner        (group)
 *      leaf
 *    child2
 *  top2
 */
function fixture() {
	const flat = [
		stubLine({ id: "top1" }),
		stubLine({ id: "grp", isGroup: true }),
		stubLine({ id: "child1", groupId: "grp" }),
		stubLine({ id: "inner", isGroup: true, groupId: "grp" }),
		stubLine({ id: "leaf", groupId: "inner" }),
		stubLine({ id: "child2", groupId: "grp" }),
		stubLine({ id: "top2" }),
	];
	return { flat, rows: buildRows(flat) };
}

describe("resolveDropTarget", () => {
	it("drops at the very top", () => {
		const { rows } = fixture();
		expect(resolveDropTarget(rows, "child1", 0, 0)).toEqual({
			groupId: null,
			beforeId: null,
			afterId: "top1",
			depth: 0,
		});
	});

	it("drops between two top-level rows", () => {
		const { rows } = fixture();
		// Gap 1 is below top1; dragging child1 there (rest excludes child1).
		expect(resolveDropTarget(rows, "child1", 1, 0)).toEqual({
			groupId: null,
			beforeId: "top1",
			afterId: "grp",
			depth: 0,
		});
	});

	it("drops into a group (depth hint one deeper than the group header)", () => {
		const { rows } = fixture();
		// Gap directly below grp's header, hinting one level in.
		expect(resolveDropTarget(rows, "top1", 2, 1)).toEqual({
			groupId: "grp",
			beforeId: null,
			afterId: "child1",
			depth: 1,
		});
	});

	it("moves within a group between two siblings", () => {
		const { rows } = fixture();
		// Gap between child1 and inner (display index of inner is 3, child1 is
		// the dragged row at index 2 → restGap shifts).
		expect(resolveDropTarget(rows, "child2", 3, 1)).toEqual({
			groupId: "grp",
			beforeId: "child1",
			afterId: "inner",
			depth: 1,
		});
	});

	it("drops into a nested group", () => {
		const { rows } = fixture();
		// Gap directly below inner's header, hinting two levels in.
		expect(resolveDropTarget(rows, "top1", 4, 2)).toEqual({
			groupId: "inner",
			beforeId: null,
			afterId: "leaf",
			depth: 2,
		});
	});

	it("stays in the group at its closing edge when hinted deeper", () => {
		const { rows } = fixture();
		// Gap between child2 (grp's last row) and top2: depth 1 lands inside
		// grp as its new last child, displaying exactly at the gap.
		expect(resolveDropTarget(rows, "top1", 6, 1)).toEqual({
			groupId: "grp",
			beforeId: "child2",
			afterId: null,
			depth: 1,
		});
	});

	it("drags out of the group at the same gap when hinted to the top level", () => {
		const { rows } = fixture();
		// Same gap, top-level hint: lands after grp's whole subtree — the
		// previous top-level sibling is grp itself.
		expect(resolveDropTarget(rows, "top1", 6, 0)).toEqual({
			groupId: null,
			beforeId: "grp",
			afterId: "top2",
			depth: 0,
		});
	});

	it("drops out of a group at the bottom edge", () => {
		const { rows } = fixture();
		// Below the last row, hinting top level.
		expect(resolveDropTarget(rows, "child1", 7, 0)).toEqual({
			groupId: null,
			beforeId: "top2",
			afterId: null,
			depth: 0,
		});
	});

	it("stays in the group at the bottom edge of the group when hinted", () => {
		const { rows } = fixture();
		// Below child2 (last row of grp, followed by top2 in display but not in
		// the fixture) — use the gap below leaf with depth 2 to stay in inner.
		expect(resolveDropTarget(rows, "child1", 5, 2)).toEqual({
			groupId: "inner",
			beforeId: "leaf",
			afterId: null,
			depth: 2,
		});
	});

	it("refuses to drop a group into its own subtree", () => {
		const { rows } = fixture();
		// Dragging grp, gap below child1 with a hint inside grp.
		expect(resolveDropTarget(rows, "grp", 3, 1)).toBeNull();
	});

	it("refuses to drop a group into its own nested group", () => {
		const { rows } = fixture();
		// Dragging grp onto inner's children.
		expect(resolveDropTarget(rows, "grp", 5, 2)).toBeNull();
	});

	it("resolves inline creation (NEW_ROW_ID) below a group member into that group", () => {
		const { rows } = fixture();
		// Gap below child1 without removing any row — creating a new line.
		expect(resolveDropTarget(rows, NEW_ROW_ID, 3, 1)).toEqual({
			groupId: "grp",
			beforeId: "child1",
			afterId: "inner",
			depth: 1,
		});
	});

	it("resolves inline creation below a group header as its first child", () => {
		const { rows } = fixture();
		expect(resolveDropTarget(rows, NEW_ROW_ID, 2, 1)).toEqual({
			groupId: "grp",
			beforeId: null,
			afterId: "child1",
			depth: 1,
		});
	});

	it("a dragged row hovering its own spot is a no-op-shaped target", () => {
		const { rows } = fixture();
		const target = resolveDropTarget(rows, "child1", 2, 1);
		expect(target).toEqual({
			groupId: "grp",
			beforeId: null,
			afterId: "inner",
			depth: 1,
		});
	});
});
