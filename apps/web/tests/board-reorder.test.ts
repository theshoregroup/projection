import { describe, expect, it } from "vitest";
import {
	computeReorderTargets,
	insertionGap,
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

describe("computeReorderTargets", () => {
	it("drop at the very top", () => {
		expect(computeReorderTargets(lines, "c", 0)).toEqual({
			beforeId: null,
			afterId: "a",
		});
	});
	it("drop right below the hovered row when dragging down", () => {
		expect(computeReorderTargets(lines, "a", 1)).toEqual({
			beforeId: "b",
			afterId: "c",
		});
	});
	it("drop right above the hovered row when dragging up", () => {
		expect(computeReorderTargets(lines, "d", 1)).toEqual({
			beforeId: "a",
			afterId: "b",
		});
	});
	it("drop at the very bottom", () => {
		expect(computeReorderTargets(lines, "a", 3)).toEqual({
			beforeId: "d",
			afterId: null,
		});
	});
	it("hovering its own row is a no-op", () => {
		expect(computeReorderTargets(lines, "b", 1)).toEqual({
			beforeId: "a",
			afterId: "c",
		});
	});
});
