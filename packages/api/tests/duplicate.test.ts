import { describe, expect, it } from "vitest";

import { duplicateLines, type DuplicatableLine } from "../src/domain/duplicate";

function makeLine(partial: Partial<DuplicatableLine>): DuplicatableLine {
	return {
		id: "l1",
		item: "Line",
		startDate: "2026-03-01",
		endDate: "2026-03-05",
		assignee: null,
		note: null,
		percentComplete: 0,
		isMilestone: false,
		isGroup: false,
		groupId: null,
		sortOrder: 1024,
		...partial,
	};
}

it("copies lines onto the new project with fresh ids", () => {
	const lines = [makeLine({ id: "a" }), makeLine({ id: "b" })];
	const out = duplicateLines(lines, "new-project");

	expect(out).toHaveLength(2);
	expect(out.every((l) => l.projectId === "new-project")).toBe(true);
	// fresh ids, distinct from the source and each other
	const ids = out.map((l) => l.id);
	expect(ids.some((id) => id === "a" || id === "b")).toBe(false);
	expect(new Set(ids).size).toBe(2);
	// content carried over
	expect(out[0]?.item).toBe("Line");
	expect(out[1]?.sortOrder).toBe(1024);
});

it("remaps groupId so children point at the copied group, not the source", () => {
	const lines = [
		makeLine({ id: "grp", isGroup: true, sortOrder: 1024 }),
		makeLine({ id: "child-1", groupId: "grp", sortOrder: 2048 }),
		makeLine({ id: "child-2", groupId: "grp", sortOrder: 3072 }),
		makeLine({ id: "loose", sortOrder: 4096 }),
	];
	const out = duplicateLines(lines, "new-project");

	const group = out.find((l) => l.isGroup);
	const children = out.filter((l) => l.groupId !== null);
	const loose = out.find((l) => l.sortOrder === 4096);

	expect(group).toBeDefined();
	expect(children).toHaveLength(2);
	// children reference the new group id…
	expect(children.every((l) => l.groupId === group?.id)).toBe(true);
	// …which is not the source group's id
	expect(group?.id).not.toBe("grp");
	expect(loose?.groupId).toBeNull();
});

it("handles an empty project", () => {
	expect(duplicateLines([], "new-project")).toEqual([]);
});

describe("dayOffset shifting", () => {
	it("shifts dates forward by a positive offset", () => {
		const lines = [
			makeLine({ id: "a", startDate: "2026-01-01", endDate: "2026-01-05" }),
			makeLine({ id: "b", startDate: "2026-02-01", endDate: "2026-04-10" }),
		];
		const out = duplicateLines(lines, "new-project", { dayOffset: 4 });

		expect(out[0]?.startDate).toBe("2026-01-05");
		expect(out[0]?.endDate).toBe("2026-01-09");
		expect(out[1]?.startDate).toBe("2026-02-05");
		expect(out[1]?.endDate).toBe("2026-04-14");
	});

	it("shifts dates backward by a negative offset", () => {
		const lines = [
			makeLine({ id: "a", startDate: "2026-01-10", endDate: "2026-01-15" }),
		];
		const out = duplicateLines(lines, "new-project", { dayOffset: -3 });

		expect(out[0]?.startDate).toBe("2026-01-07");
		expect(out[0]?.endDate).toBe("2026-01-12");
	});

	it("leaves dates unchanged when offset is 0 or omitted", () => {
		const lines = [
			makeLine({ id: "a", startDate: "2026-01-01", endDate: "2026-01-05" }),
		];
		const withZero = duplicateLines(lines, "new-project", { dayOffset: 0 });
		expect(withZero[0]?.startDate).toBe("2026-01-01");
		expect(withZero[0]?.endDate).toBe("2026-01-05");

		const withoutOption = duplicateLines(lines, "new-project");
		expect(withoutOption[0]?.startDate).toBe("2026-01-01");
		expect(withoutOption[0]?.endDate).toBe("2026-01-05");
	});

	it("correctly crosses month and year boundaries", () => {
		const lines = [
			makeLine({ id: "a", startDate: "2026-01-30", endDate: "2026-12-31" }),
		];
		const out = duplicateLines(lines, "new-project", { dayOffset: 5 });

		expect(out[0]?.startDate).toBe("2026-02-04");
		expect(out[0]?.endDate).toBe("2027-01-05");
	});
});