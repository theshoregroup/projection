// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BarPopover from "@/components/board/bar-popover";
import type { LineRow } from "@/lib/collections";

// jsdom lacks ResizeObserver (floating-ui positions through it)
class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver =
	globalThis.ResizeObserver ??
	(ResizeObserverStub as unknown as typeof ResizeObserver);

const line: LineRow = {
	id: "line-1",
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	projectId: "proj-1",
	item: "Roof beams",
	startDate: "2026-07-10",
	endDate: "2026-07-14",
	assignee: null,
	note: "Order early",
	percentComplete: 0,
	isMilestone: false,
	isGroup: false,
	groupId: null,
	sortOrder: 1024,
};

type Persisted = { isPersisted: { promise: Promise<void> } };

function makeCollection() {
	const persisted: Persisted = { isPersisted: { promise: Promise.resolve() } };
	return {
		update: vi.fn<(id: string, mutate: (draft: LineRow) => void) => Persisted>(
			() => persisted,
		),
		delete: vi.fn<(id: string) => Persisted>(() => persisted),
	};
}

type FakeCollection = ReturnType<typeof makeCollection>;

function renderPopover(collection: FakeCollection = makeCollection()) {
	const anchor = document.createElement("div");
	document.body.appendChild(anchor);
	const onClose = vi.fn();
	render(
		<BarPopover
			line={line}
			collection={collection as never}
			anchor={anchor}
			onClose={onClose}
		/>,
	);
	return { collection, onClose };
}

/** Runs the update callback against a draft so we can see what would change. */
function appliedChanges(update: FakeCollection["update"]): Partial<LineRow> {
	const call = update.mock.calls[0];
	if (!call) throw new Error("update was not called");
	const draft = { ...line };
	call[1](draft);
	const changes: Partial<LineRow> = {};
	for (const key of Object.keys(draft) as (keyof LineRow)[]) {
		if (draft[key] !== line[key]) changes[key] = draft[key] as never;
	}
	return changes;
}

afterEach(cleanup);

describe("BarPopover", () => {
	it("renders anchored to the bar with dates and note", () => {
		renderPopover();
		expect(screen.getByText("Milestone (single day)")).toBeTruthy();
		expect(screen.getByLabelText("Start")).toHaveProperty(
			"value",
			"2026-07-10",
		);
		expect(screen.getByLabelText("End")).toHaveProperty("value", "2026-07-14");
		expect(screen.getByLabelText("Note (shows on the bar)")).toHaveProperty(
			"value",
			"Order early",
		);
	});

	it("toggling Milestone collapses End onto Start", () => {
		const { collection } = renderPopover();
		fireEvent.click(screen.getByRole("checkbox"));
		expect(collection.update).toHaveBeenCalledOnce();
		expect(appliedChanges(collection.update)).toEqual({
			isMilestone: true,
			endDate: "2026-07-10",
		});
	});

	it("moving Start shifts End by the same delta", () => {
		const { collection } = renderPopover();
		fireEvent.change(screen.getByLabelText("Start"), {
			target: { value: "2026-07-12" },
		});
		expect(appliedChanges(collection.update)).toEqual({
			startDate: "2026-07-12",
			endDate: "2026-07-16",
		});
	});

	it("delete is two-step: arm, then confirm", async () => {
		const { collection, onClose } = renderPopover();
		const button = screen.getByRole("button", { name: "Delete line" });
		fireEvent.click(button);
		expect(collection.delete).not.toHaveBeenCalled();
		fireEvent.click(
			screen.getByRole("button", { name: "Click again to delete this line" }),
		);
		expect(collection.delete).toHaveBeenCalledWith("line-1");
		await vi.waitFor(() => expect(onClose).toHaveBeenCalledOnce());
	});
});
