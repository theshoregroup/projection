// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
	ASSIGNEE_DEFAULT_WIDTH,
	ASSIGNEE_MIN_WIDTH,
	ITEM_MIN_WIDTH,
	PANEL_DEFAULT_WIDTH,
	PANEL_MIN_WIDTH,
	useBoardPanel,
} from "@/hooks/use-board-panel";
import type React from "react";

class ResizeObserverStub {
	observe() {}
	unobserve() {}
	disconnect() {}
}
globalThis.ResizeObserver =
	globalThis.ResizeObserver ??
	(ResizeObserverStub as unknown as typeof ResizeObserver);

class StorageMock implements Storage {
	private store = new Map<string, string>();

	get length() {
		return this.store.size;
	}

	key(index: number) {
		return Array.from(this.store.keys())[index] ?? null;
	}

	getItem(key: string) {
		return this.store.get(key) ?? null;
	}

	setItem(key: string, value: string) {
		this.store.set(key, String(value));
	}

	removeItem(key: string) {
		this.store.delete(key);
	}

	clear() {
		this.store.clear();
	}
}

const storageMock = new StorageMock();
Object.defineProperty(window, "localStorage", {
	value: storageMock,
	writable: true,
	configurable: true,
});
Object.defineProperty(globalThis, "localStorage", {
	value: storageMock,
	writable: true,
	configurable: true,
});

function fakePointerEvent(clientX: number): React.PointerEvent<Element> {
	return {
		clientX,
		pointerId: 1,
		currentTarget: { setPointerCapture: vi.fn() },
	} as unknown as React.PointerEvent<Element>;
}

describe("useBoardPanel", () => {
	beforeEach(() => {
		window.localStorage.clear();
		window.innerWidth = 1200;
	});

	afterEach(() => {
		window.localStorage.clear();
	});

	it("defaults to open with default widths", async () => {
		const { result } = renderHook(() => useBoardPanel());
		await waitFor(() => expect(result.current.isOpen).toBe(true));
		expect(result.current.panelWidth).toBe(PANEL_DEFAULT_WIDTH);
		expect(result.current.assigneeWidth).toBe(ASSIGNEE_DEFAULT_WIDTH);
	});

	it("loads persisted values", async () => {
		window.localStorage.setItem(
			"projection.boardPanel.open",
			JSON.stringify(false),
		);
		window.localStorage.setItem(
			"projection.boardPanel.width",
			JSON.stringify(300),
		);
		window.localStorage.setItem(
			"projection.boardPanel.assigneeWidth",
			JSON.stringify(120),
		);

		const { result } = renderHook(() => useBoardPanel());
		await waitFor(() => expect(result.current.isOpen).toBe(false));
		expect(result.current.panelWidth).toBe(0);
		expect(result.current.assigneeWidth).toBe(120);
	});

	it("clamps panel width to 50vw and the minimum", async () => {
		window.innerWidth = 600;

		window.localStorage.setItem(
			"projection.boardPanel.width",
			JSON.stringify(500),
		);
		const { result: tooBig } = renderHook(() => useBoardPanel());
		await waitFor(() => expect(tooBig.current.panelWidth).toBe(300));

		window.localStorage.setItem(
			"projection.boardPanel.width",
			JSON.stringify(100),
		);
		const { result: tooSmall } = renderHook(() => useBoardPanel());
		await waitFor(() => expect(tooSmall.current.panelWidth).toBe(PANEL_MIN_WIDTH));
	});

	it("dragging the outer handle changes the panel width", async () => {
		const { result } = renderHook(() => useBoardPanel());
		await waitFor(() => expect(result.current.panelWidth).toBe(PANEL_DEFAULT_WIDTH));

		act(() => result.current.startPanelResize(fakePointerEvent(100)));
		act(() => result.current.onPointerMove(fakePointerEvent(150)));
		expect(result.current.panelWidth).toBe(PANEL_DEFAULT_WIDTH + 50);

		act(() => result.current.onPointerUp());
		expect(result.current.isOpen).toBe(true);
	});

	it("dragging the outer handle past the collapse snap closes the panel", async () => {
		const { result } = renderHook(() => useBoardPanel());
		await waitFor(() => expect(result.current.panelWidth).toBe(PANEL_DEFAULT_WIDTH));

		// A small drag stays open.
		act(() => result.current.startPanelResize(fakePointerEvent(0)));
		act(() => result.current.onPointerMove(fakePointerEvent(-40)));
		act(() => result.current.onPointerUp());
		expect(result.current.isOpen).toBe(true);

		// Dragging below the collapse snap closes it.
		act(() => result.current.startPanelResize(fakePointerEvent(0)));
		act(() => result.current.onPointerMove(fakePointerEvent(-(PANEL_DEFAULT_WIDTH - 40))));
		act(() => result.current.onPointerUp());
		expect(result.current.isOpen).toBe(false);
		expect(result.current.panelWidth).toBe(0);
	});

	it("clicking the closed rail opens the panel", async () => {
		window.localStorage.setItem(
			"projection.boardPanel.open",
			JSON.stringify(false),
		);
		window.localStorage.setItem(
			"projection.boardPanel.width",
			JSON.stringify(0),
		);

		const { result } = renderHook(() => useBoardPanel());
		await waitFor(() => expect(result.current.isOpen).toBe(false));

		act(() => result.current.startRailOpen(fakePointerEvent(0)));
		act(() => result.current.onPointerUp());

		expect(result.current.isOpen).toBe(true);
		expect(result.current.panelWidth).toBe(PANEL_DEFAULT_WIDTH);
	});

	it("dragging the assignee handle changes its width", async () => {
		const { result } = renderHook(() => useBoardPanel());
		await waitFor(() =>
			expect(result.current.assigneeWidth).toBe(ASSIGNEE_DEFAULT_WIDTH),
		);

		// Dragging left grows the assignee column (and shrinks the item column).
		act(() => result.current.startAssigneeResize(fakePointerEvent(0)));
		act(() => result.current.onPointerMove(fakePointerEvent(-40)));
		expect(result.current.assigneeWidth).toBe(ASSIGNEE_DEFAULT_WIDTH + 40);

		act(() => result.current.onPointerUp());
		expect(result.current.assigneeWidth).toBe(ASSIGNEE_DEFAULT_WIDTH + 40);
	});

	it("clamps assignee width to min and max", async () => {
		const { result } = renderHook(() => useBoardPanel());
		await waitFor(() =>
			expect(result.current.assigneeWidth).toBe(ASSIGNEE_DEFAULT_WIDTH),
		);

		// Dragging far left clamps to the maximum allowed by the panel width.
		act(() => result.current.startAssigneeResize(fakePointerEvent(0)));
		act(() => result.current.onPointerMove(fakePointerEvent(-1000)));
		act(() => result.current.onPointerUp());
		expect(result.current.assigneeWidth).toBeLessThanOrEqual(
			PANEL_DEFAULT_WIDTH - ITEM_MIN_WIDTH - 4 - 10,
		);

		// Dragging far right clamps to the assignee minimum.
		act(() => result.current.startAssigneeResize(fakePointerEvent(0)));
		act(() => result.current.onPointerMove(fakePointerEvent(1000)));
		act(() => result.current.onPointerUp());
		expect(result.current.assigneeWidth).toBe(ASSIGNEE_MIN_WIDTH);
	});
});
