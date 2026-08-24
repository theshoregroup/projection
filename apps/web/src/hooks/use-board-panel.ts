import { useCallback, useEffect, useRef, useState } from "react";

// The panel carries Item + Assignee columns (dates live on the timeline
// side, not as panel cells), so the defaults and minimums account for them.
export const PANEL_DEFAULT_WIDTH = 260;
export const PANEL_MIN_WIDTH = 180;
export const PANEL_COLLAPSE_SNAP = 60;
export const RAIL_OPEN_THRESHOLD = 90;

export const ASSIGNEE_DEFAULT_WIDTH = 96;
export const ASSIGNEE_MIN_WIDTH = 64;
export const ITEM_MIN_WIDTH = 100;

export const OUTER_HANDLE_WIDTH = 4;
export const INNER_HANDLE_WIDTH = 4;

// Approximate horizontal space eaten by panel borders + row/header padding so
// the assignee clamp leaves the Item column at least ITEM_MIN_WIDTH wide.
const PANEL_CONTENT_OVERHEAD = 10;

const STORAGE = {
	open: "projection.boardPanel.open",
	width: "projection.boardPanel.width",
	assigneeWidth: "projection.boardPanel.assigneeWidth",
} as const;

function readStorage<T>(key: string, fallback: T): T {
	if (typeof window === "undefined") return fallback;
	try {
		const raw = window.localStorage.getItem(key);
		if (raw === null) return fallback;
		return JSON.parse(raw) as T;
	} catch {
		return fallback;
	}
}

function writeStorage(key: string, value: unknown) {
	if (typeof window === "undefined") return;
	try {
		window.localStorage.setItem(key, JSON.stringify(value));
	} catch {}
}

export function useBoardPanel() {
	const [isOpen, setIsOpen] = useState(true);
	const [panelWidth, setPanelWidth] = useState(PANEL_DEFAULT_WIDTH);
	const [lastOpenWidth, setLastOpenWidth] = useState(PANEL_DEFAULT_WIDTH);
	const [assigneeWidth, setAssigneeWidth] = useState(ASSIGNEE_DEFAULT_WIDTH);
	const [maxPanelWidth, setMaxPanelWidth] = useState(
		typeof window !== "undefined"
			? Math.floor(window.innerWidth * 0.5)
			: PANEL_DEFAULT_WIDTH,
	);

	// Refs mirror the latest state so drag event handlers can read live values
	// without depending on stale closures.
	const isOpenRef = useRef(isOpen);
	const panelWidthRef = useRef(panelWidth);
	const lastOpenWidthRef = useRef(lastOpenWidth);
	const assigneeWidthRef = useRef(assigneeWidth);

	useEffect(() => {
		isOpenRef.current = isOpen;
	}, [isOpen]);
	useEffect(() => {
		panelWidthRef.current = panelWidth;
	}, [panelWidth]);
	useEffect(() => {
		lastOpenWidthRef.current = lastOpenWidth;
	}, [lastOpenWidth]);
	useEffect(() => {
		assigneeWidthRef.current = assigneeWidth;
	}, [assigneeWidth]);

	// Load persisted values after mount so SSR hydration isn't affected.
	useEffect(() => {
		const storedOpen = readStorage(STORAGE.open, true);
		const storedWidth = readStorage(STORAGE.width, PANEL_DEFAULT_WIDTH);
		const storedAssignee = readStorage(
			STORAGE.assigneeWidth,
			ASSIGNEE_DEFAULT_WIDTH,
		);
		// The content minimum (Item + Assignee + Start + End columns) wins over
		// the 50vw cap — on narrow windows the panel takes what it needs.
		const clampedWidth = Math.max(
			PANEL_MIN_WIDTH,
			Math.min(storedWidth, Math.floor(window.innerWidth * 0.5)),
		);

		setIsOpen(storedOpen);
		setPanelWidth(storedOpen ? clampedWidth : 0);
		setLastOpenWidth(
			storedOpen && storedWidth > 0 ? storedWidth : PANEL_DEFAULT_WIDTH,
		);
		setAssigneeWidth(storedAssignee);
		setMaxPanelWidth(Math.floor(window.innerWidth * 0.5));
	}, []);

	useEffect(() => {
		function onResize() {
			setMaxPanelWidth(Math.floor(window.innerWidth * 0.5));
		}
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	const clampPanel = useCallback(
		(w: number) => Math.max(PANEL_MIN_WIDTH, Math.min(w, maxPanelWidth)),
		[maxPanelWidth],
	);

	const maxAssigneeWidth =
		panelWidth - ITEM_MIN_WIDTH - INNER_HANDLE_WIDTH - PANEL_CONTENT_OVERHEAD;

	const clampAssignee = useCallback(
		(aw: number) =>
			Math.min(Math.max(aw, ASSIGNEE_MIN_WIDTH), maxAssigneeWidth),
		[maxAssigneeWidth],
	);

	// Clamp panel width whenever the viewport max changes.
	useEffect(() => {
		if (!isOpenRef.current) return;
		setPanelWidth((prev) => (prev === 0 ? 0 : clampPanel(prev)));
	}, [clampPanel, maxPanelWidth]);

	// Keep the assignee column inside the panel as the panel resizes.
	useEffect(() => {
		if (!isOpenRef.current) return;
		setAssigneeWidth((prev) => clampAssignee(prev));
	}, [clampAssignee, panelWidth]);

	useEffect(() => {
		writeStorage(STORAGE.open, isOpen);
	}, [isOpen]);

	useEffect(() => {
		writeStorage(STORAGE.width, panelWidth);
	}, [panelWidth]);

	useEffect(() => {
		writeStorage(STORAGE.assigneeWidth, assigneeWidth);
	}, [assigneeWidth]);

	const dragRef = useRef<{
		kind: "panel" | "rail" | "assignee";
		startX: number;
		startPanelWidth: number;
		startAssigneeWidth: number;
		moved: boolean;
	} | null>(null);

	const startPanelResize = useCallback((event: React.PointerEvent) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = {
			kind: "panel",
			startX: event.clientX,
			startPanelWidth: panelWidthRef.current,
			startAssigneeWidth: assigneeWidthRef.current,
			moved: false,
		};
	}, []);

	const startRailOpen = useCallback((event: React.PointerEvent) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = {
			kind: "rail",
			startX: event.clientX,
			startPanelWidth: 0,
			startAssigneeWidth: assigneeWidthRef.current,
			moved: false,
		};
	}, []);

	const startAssigneeResize = useCallback((event: React.PointerEvent) => {
		event.currentTarget.setPointerCapture(event.pointerId);
		dragRef.current = {
			kind: "assignee",
			startX: event.clientX,
			startPanelWidth: panelWidthRef.current,
			startAssigneeWidth: assigneeWidthRef.current,
			moved: false,
		};
	}, []);

	const onPointerMove = useCallback(
		(event: React.PointerEvent) => {
			const drag = dragRef.current;
			if (!drag) return;

			const deltaX = event.clientX - drag.startX;
			if (Math.abs(deltaX) > 2) drag.moved = true;

			if (drag.kind === "panel") {
				// During the drag, allow the panel to shrink below its minimum so it
				// can snap closed on release; the minimum is enforced on pointer up.
				const next = Math.min(
					Math.max(drag.startPanelWidth + deltaX, 0),
					maxPanelWidth,
				);
				setPanelWidth(next);
				setIsOpen(true);
			} else if (drag.kind === "rail") {
				// Drag the thin left rail to the right to open the panel.
				const next = Math.min(
					Math.max(event.clientX - drag.startX, 0),
					maxPanelWidth,
				);
				setPanelWidth(next);
				setIsOpen(true);
			} else if (drag.kind === "assignee") {
				// The handle sits between the Item and Assignee columns; moving it
				// right (positive delta) makes the Item column wider, so the
				// Assignee column must shrink.
				setAssigneeWidth(clampAssignee(drag.startAssigneeWidth - deltaX));
			}
		},
		[clampAssignee, maxPanelWidth],
	);

	const onPointerUp = useCallback(() => {
		const drag = dragRef.current;
		dragRef.current = null;
		if (!drag) return;

		if (drag.kind === "panel") {
			if (panelWidthRef.current < PANEL_COLLAPSE_SNAP) {
				setIsOpen(false);
				setPanelWidth(0);
			} else {
				const next = clampPanel(panelWidthRef.current);
				setPanelWidth(next);
				setLastOpenWidth(next);
				setIsOpen(true);
			}
		} else if (drag.kind === "rail") {
			if (!drag.moved) {
				// Treat a click on the rail as a toggle-open.
				const next = clampPanel(
					lastOpenWidthRef.current || PANEL_DEFAULT_WIDTH,
				);
				setPanelWidth(next);
				setLastOpenWidth(next);
				setIsOpen(true);
			} else if (panelWidthRef.current < RAIL_OPEN_THRESHOLD) {
				setIsOpen(false);
				setPanelWidth(0);
			} else {
				const next = clampPanel(panelWidthRef.current);
				setPanelWidth(next);
				setLastOpenWidth(next);
				setIsOpen(true);
			}
		} else if (drag.kind === "assignee") {
			setAssigneeWidth(clampAssignee(assigneeWidthRef.current));
		}
	}, [clampPanel, clampAssignee]);

	const toggle = useCallback(() => {
		setIsOpen((prev) => {
			if (prev) {
				setPanelWidth(0);
				return false;
			}
			const next = clampPanel(lastOpenWidthRef.current || PANEL_DEFAULT_WIDTH);
			setPanelWidth(next);
			setLastOpenWidth(next);
			return true;
		});
	}, [clampPanel]);

	return {
		isOpen,
		panelWidth,
		assigneeWidth,
		setIsOpen,
		setPanelWidth,
		setAssigneeWidth,
		startPanelResize,
		startRailOpen,
		startAssigneeResize,
		onPointerMove,
		onPointerUp,
		toggle,
	} as const;
}
