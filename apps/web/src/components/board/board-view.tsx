import {
	CaretLeftIcon,
	CaretRightIcon,
	DotsSixVerticalIcon,
	PlusIcon,
	RowsIcon,
} from "@phosphor-icons/react/dist/ssr";
import { assigneeColor } from "@projection/api/domain/colors";
import { addDays, deriveWindow, diffDays } from "@projection/api/domain/dates";
import {
	BAR_INSET,
	BAR_RADIUS,
	barForLine,
	boardHeight,
	boardWidth,
	DATE_COL_WIDTH,
	DEFAULT_DAY_WIDTH,
	DIAMOND_SIZE,
	dateToX,
	diamondPath,
	type Geometry,
	groupCapPaths,
	HEADER_HEIGHT,
	INDENT_PX,
	offscreenSide,
	ROW_HEIGHT,
	rowY,
	ticksFor,
	type Viewport,
	weekendSpans,
	xToDate,
} from "@projection/api/domain/geometry";
import { buildRows } from "@projection/api/domain/groups";
import { sortOrderBetween } from "@projection/api/domain/ordering";
import { Checkbox } from "@projection/ui/components/checkbox";
import { useIsMobile } from "@projection/ui/hooks/use-mobile";
import { useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import BarPopover from "@/components/board/bar-popover";
import BoardSidePanel from "@/components/board/board-side-panel";
import InlineTextEdit from "@/components/board/inline-text-edit";
import ReorderDragPreview from "@/components/board/reorder-drag-preview";
import ZoomBar from "@/components/board/zoom-bar";
import { PANEL_MIN_WIDTH, useBoardPanel } from "@/hooks/use-board-panel";
import {
	type DropTarget,
	insertionGap,
	NEW_ROW_ID,
	resolveDropTarget,
} from "@/lib/board-layout/reorder";
import type { getLinesCollection, LineRow } from "@/lib/collections";
import { useTRPCClient } from "@/utils/trpc";

type LinesCollection = ReturnType<typeof getLinesCollection>;

interface BoardViewProps {
	project: { id: string; name: string; seedStart: string; seedEnd: string };
	lines: LineRow[];
	/** Read-only render for the public Share Link — no controls, no mutations. */
	readOnly?: boolean;
	linesCollection?: LinesCollection;
	/** Checked rows (owned by the page — the bulk actions live in its header). */
	selectedIds?: ReadonlySet<string>;
	onToggleSelected?: (lineId: string, checked: boolean) => void;
	/** A just-created row (e.g. a new Group) whose Item cell should open. */
	renameItemId?: string | null;
}

type DragMode = "move" | "resize-start" | "resize-end";

interface DragState {
	mode: DragMode;
	lineId: string;
	pointerStartX: number;
	origStart: string;
	origEnd: string;
	/** Whether the pointer actually moved dates — a click opens the popover. */
	moved: boolean;
	/** The bar element grabbed (popover anchor when clicked). */
	target: Element;
}

/** X offset of the Item text inside a row: padding + checkbox + handle +
 * gaps. Drives the drag depth hint (horizontal pointer → nesting level). */
const ROW_BASE_X = 44;

export default function BoardView({
	project,
	lines,
	readOnly = false,
	linesCollection,
	selectedIds,
	onToggleSelected,
	renameItemId,
}: BoardViewProps) {
	const trpcClient = useTRPCClient();
	const queryClient = useQueryClient();

	const [dayWidth, setDayWidth] = useState(DEFAULT_DAY_WIDTH);
	const [preview, setPreview] = useState<{
		lineId: string;
		startDate: string;
		endDate: string;
	} | null>(null);
	/** Row index the inline create row is open at (null = closed). */
	const [creatingAt, setCreatingAt] = useState<number | null>(null);
	/** The bar popover's Line and anchor element (null = closed). */
	const [barPopover, setBarPopover] = useState<{
		lineId: string;
		anchor: Element;
	} | null>(null);
	/** Timeline draw-to-create: span preview while dragging (null = not drawing). */
	const [createPreview, setCreatePreview] = useState<{
		startDate: string;
		endDate: string;
		row: number;
	} | null>(null);
	/** Hovered empty Timeline day cell, for the "+" ghost. */
	const [hoverCell, setHoverCell] = useState<{
		date: string;
		row: number;
	} | null>(null);
	/** True while hovering a row that already has a Line (no creation there). */
	const [hoverBlocked, setHoverBlocked] = useState(false);
	/** A just-drawn Line whose Item cell should open for naming. */
	const [editingItemId, setEditingItemId] = useState<string | null>(null);
	const [reorderHover, setReorderHover] = useState<{
		lineId: string;
		index: number;
		/** The insertion gap (display coordinates) and resolved drop target. */
		gap: number;
		target: DropTarget | null;
		/** Pointer position for the drag preview that follows the cursor. */
		x: number;
		y: number;
	} | null>(null);

	const dragRef = useRef<DragState | null>(null);
	/** A bar press that turned out to be a click — consumed by onBarClick. */
	const clickCandidateRef = useRef<{
		lineId: string;
		target: Element;
	} | null>(null);
	const reorderRef = useRef<{ lineId: string } | null>(null);
	const createDragRef = useRef<{
		startDate: string;
		endDate: string;
		row: number;
		moved: boolean;
	} | null>(null);
	const rowsRef = useRef<HTMLDivElement | null>(null);
	const scrollerRef = useRef<HTMLDivElement | null>(null);
	/** The Timeline's visible X range — drives the offscreen nudges. */
	const [viewport, setViewport] = useState<Viewport | null>(null);

	const {
		isOpen,
		panelWidth,
		assigneeWidth,
		startPanelResize,
		startRailOpen,
		startAssigneeResize,
		onPointerMove,
		onPointerUp,
		toggle,
	} = useBoardPanel();
	const isMobile = useIsMobile();
	const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

	// Visible rows: Groups flatten depth-first with siblings in sortOrder —
	// every Line is exactly one row, so row indexes stay aligned everywhere.
	const rows = buildRows(lines);
	const rowLines = rows.map((row) => row.line);
	// The selection checkbox column only exists on editable boards.
	const hasSelection = !readOnly && onToggleSelected !== undefined;

	const window = deriveWindow(lines, project);
	const geom: Geometry = { start: window.start, end: window.end, dayWidth };
	const width = boardWidth(geom);
	const height = boardHeight(rows.length);
	// Editable boards extend one row below the last Line: the draw-to-create
	// band for a new Line (aligns with the "Add new line" footer row). With no
	// Lines the phantom row from boardHeight already *is* that band.
	const svgHeight = height + (readOnly || rows.length === 0 ? 0 : ROW_HEIGHT);
	const ticks = ticksFor(geom);
	const weekends = weekendSpans(geom);

	// Track the Timeline's scroll viewport (the window fits every Line, so
	// "offscreen" means outside the *scrolled-to* region, not the window).
	useEffect(() => {
		const el = scrollerRef.current;
		if (!el) return;
		const measure = () =>
			setViewport({
				startX: el.scrollLeft,
				endX: el.scrollLeft + el.clientWidth,
			});
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	function onTimelineScroll(event: React.UIEvent<HTMLDivElement>) {
		const el = event.currentTarget;
		setViewport({
			startX: el.scrollLeft,
			endX: el.scrollLeft + el.clientWidth,
		});
	}

	// --- Drag move / resize -------------------------------------------------

	function startDrag(event: React.PointerEvent, line: LineRow, mode: DragMode) {
		if (readOnly || !linesCollection) return;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		dragRef.current = {
			mode,
			lineId: line.id,
			pointerStartX: event.clientX,
			origStart: line.startDate,
			origEnd: line.endDate,
			moved: false,
			target: event.currentTarget as Element,
		};
	}

	function onDragMove(event: React.PointerEvent) {
		const drag = dragRef.current;
		if (!drag) return;
		const deltaDays = Math.round(
			(event.clientX - drag.pointerStartX) / dayWidth,
		);
		if (deltaDays !== 0) drag.moved = true;
		let start = drag.origStart;
		let end = drag.origEnd;
		if (drag.mode === "move") {
			start = addDays(drag.origStart, deltaDays);
			end = addDays(drag.origEnd, deltaDays);
		} else if (drag.mode === "resize-start") {
			start = addDays(drag.origStart, deltaDays);
			if (start > end) start = end;
		} else {
			end = addDays(drag.origEnd, deltaDays);
			if (end < start) end = start;
		}
		setPreview({ lineId: drag.lineId, startDate: start, endDate: end });
	}

	function onDragEnd() {
		const drag = dragRef.current;
		dragRef.current = null;
		if (drag && !drag.moved && drag.mode === "move") {
			// A click, not a drag — record it. The popover opens on the trailing
			// `click` event: opening on pointerup races the popover's
			// outside-press dismissal, which itself listens for `click`.
			clickCandidateRef.current = {
				lineId: drag.lineId,
				target: drag.target,
			};
			setPreview(null);
			return;
		}
		if (
			drag?.moved &&
			preview &&
			preview.lineId === drag.lineId &&
			linesCollection
		) {
			const { startDate, endDate } = preview;
			linesCollection.update(drag.lineId, (draft) => {
				draft.startDate = startDate;
				draft.endDate = endDate;
			});
		}
		setPreview(null);
	}

	/** Opens the clicked bar's popover (the press was recorded in onDragEnd). */
	function onBarClick(lineId: string) {
		const candidate = clickCandidateRef.current;
		clickCandidateRef.current = null;
		if (!candidate || candidate.lineId !== lineId) return;
		setBarPopover({ lineId, anchor: candidate.target });
	}

	// --- Row reorder ----------------------------------------------------------

	function startReorder(event: React.PointerEvent, lineId: string) {
		if (readOnly || !linesCollection) return;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		reorderRef.current = { lineId };
	}

	function onReorderMove(event: React.PointerEvent) {
		if (!reorderRef.current || !rowsRef.current) return;
		const rect = rowsRef.current.getBoundingClientRect();
		const index = Math.max(
			0,
			Math.min(
				rows.length - 1,
				Math.floor((event.clientY - rect.top) / ROW_HEIGHT),
			),
		);
		const lineId = reorderRef.current.lineId;
		const gap = insertionGap(rowLines, lineId, index);
		// Horizontal position picks the nesting level: drag right to move into
		// a Group, left to move out (Reminders-style).
		const depthHint = Math.max(
			0,
			Math.round((event.clientX - rect.left - ROW_BASE_X) / INDENT_PX),
		);
		setReorderHover({
			lineId,
			index,
			gap,
			target: resolveDropTarget(rows, lineId, gap, depthHint),
			x: event.clientX,
			y: event.clientY,
		});
	}

	async function onReorderEnd() {
		const reorder = reorderRef.current;
		const target = reorderHover?.target ?? null;
		reorderRef.current = null;
		setReorderHover(null);
		// A null target means the only resolution was a Group into its own
		// subtree — the drop is a no-op.
		if (!reorder || !linesCollection || target === null) return;
		const before = target.beforeId
			? (lines.find((l) => l.id === target.beforeId)?.sortOrder ?? null)
			: null;
		const after = target.afterId
			? (lines.find((l) => l.id === target.afterId)?.sortOrder ?? null)
			: null;
		// Optimistic local order; persisted via the reorder endpoint (the
		// collection's update handler deliberately ignores sortOrder/groupId)
		linesCollection.update(reorder.lineId, (draft) => {
			draft.sortOrder = sortOrderBetween(before, after);
			draft.groupId = target.groupId;
		});
		try {
			await trpcClient.lines.reorder.mutate({
				projectId: project.id,
				lineId: reorder.lineId,
				groupId: target.groupId,
				beforeLineId: target.beforeId,
				afterLineId: target.afterId,
			});
			await queryClient.invalidateQueries({
				queryKey: ["collection", "lines", project.id],
			});
		} catch {
			toast.error("Couldn't reorder — try again.");
		}
	}

	// --- Inline edits / creation ----------------------------------------------

	async function commitField(
		line: LineRow,
		field: "item" | "assignee",
		text: string,
	) {
		if (!linesCollection) return;
		try {
			await linesCollection.update(line.id, (draft) => {
				if (field === "item") draft.item = text;
				else draft.assignee = text || null;
			}).isPersisted.promise;
		} catch {
			// The collection rolled the optimistic change back
			toast.error("Couldn't save — your change was undone. Try again.");
			throw new Error("Persist failed");
		}
	}

	/** Where a row created at visible `index` lands: it inherits the Group of
	 * the row above (a Group header above means "first child of that Group"). */
	function createTarget(index: number): DropTarget {
		const above = rows[index - 1] ?? null;
		const hint = above
			? above.line.isGroup
				? above.depth + 1
				: above.depth
			: 0;
		return (
			resolveDropTarget(rows, NEW_ROW_ID, index, hint) ?? {
				groupId: null,
				beforeId: null,
				afterId: null,
				depth: 0,
			}
		);
	}

	async function createLine(
		item: string,
		index: number,
		dates?: { startDate: string; endDate: string; isMilestone?: boolean },
	) {
		if (!linesCollection) return;
		const target = createTarget(index);
		try {
			const created = await trpcClient.lines.create.mutate({
				projectId: project.id,
				item,
				// Default: a single day at the Project's seed start — drag the
				// bar to reschedule.
				startDate: dates?.startDate ?? project.seedStart,
				endDate: dates?.endDate ?? project.seedStart,
				isMilestone: dates?.isMilestone ?? false,
				groupId: target.groupId,
				beforeLineId: target.beforeId,
				afterLineId: target.afterId,
			});
			// The lines collection syncs off this query key (see lib/collections)
			await queryClient.invalidateQueries({
				queryKey: ["collection", "lines", project.id],
			});
			return created;
		} catch {
			toast.error("Couldn't save — try again.");
			throw new Error("Persist failed");
		}
	}

	// --- Draw-to-create on empty Timeline space -------------------------------

	/** Draw a new Line where the pointer landed: the Line takes that row and
	 * its Item cell opens for naming. */
	async function createLineAt(
		row: number,
		startDate: string,
		endDate: string,
		isMilestone: boolean,
	) {
		try {
			const created = await createLine("New line", row, {
				startDate,
				endDate,
				isMilestone,
			});
			if (created) setEditingItemId(created.id);
		} catch {
			// createLine already toasted
		}
	}

	/** Date + row under a Timeline pointer (x clamped to the window). Row
	 * rows.length = the empty bottom band below the last row — the only
	 * draw-to-create target. Rows that already have a Line are "occupied". */
	function backgroundPoint(event: React.PointerEvent): {
		date: string;
		row: number;
		inHeader: boolean;
		occupied: boolean;
	} {
		const bounds = event.currentTarget.getBoundingClientRect();
		const x = Math.max(0, Math.min(width, event.clientX - bounds.left));
		const y = event.clientY - bounds.top;
		const inHeader = y < HEADER_HEIGHT;
		const row = Math.max(
			0,
			Math.min(rows.length, Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT)),
		);
		return {
			date: xToDate(geom, x),
			row,
			inHeader,
			occupied: !inHeader && row < rows.length,
		};
	}

	function onBackgroundDown(event: React.PointerEvent) {
		if (readOnly || !linesCollection) return;
		const point = backgroundPoint(event);
		if (point.inHeader || point.occupied) return;
		(event.currentTarget as Element).setPointerCapture(event.pointerId);
		createDragRef.current = {
			startDate: point.date,
			endDate: point.date,
			row: point.row,
			moved: false,
		};
		setHoverCell(null);
		setCreatePreview({
			startDate: point.date,
			endDate: point.date,
			row: point.row,
		});
	}

	function onBackgroundMove(event: React.PointerEvent) {
		const point = backgroundPoint(event);
		const drag = createDragRef.current;
		if (!drag) {
			// Only update when the day cell actually changes (per-mousemove churn)
			setHoverCell((prev) => {
				if (point.inHeader || point.occupied)
					return prev === null ? prev : null;
				return prev?.date === point.date && prev.row === point.row
					? prev
					: { date: point.date, row: point.row };
			});
			setHoverBlocked((prev) =>
				prev === point.occupied ? prev : point.occupied,
			);
			return;
		}
		drag.endDate = point.date;
		if (point.date !== drag.startDate) drag.moved = true;
		setCreatePreview({
			startDate: drag.endDate < drag.startDate ? drag.endDate : drag.startDate,
			endDate: drag.endDate < drag.startDate ? drag.startDate : drag.endDate,
			row: drag.row,
		});
	}

	function onBackgroundUp() {
		const drag = createDragRef.current;
		createDragRef.current = null;
		setCreatePreview(null);
		if (!drag) return;
		// A click (no movement) creates a Milestone on that day; a drag a bar
		const startDate =
			drag.endDate < drag.startDate ? drag.endDate : drag.startDate;
		const endDate =
			drag.endDate < drag.startDate ? drag.startDate : drag.endDate;
		void createLineAt(drag.row, startDate, endDate, !drag.moved);
	}

	function onBackgroundCancel() {
		createDragRef.current = null;
		setCreatePreview(null);
	}

	// --- Render ---------------------------------------------------------------

	// A newly created Group opens its Item cell for naming (same pattern as
	// draw-to-create's editingItemId).
	const lastRenameRef = useRef<string | null>(null);
	useEffect(() => {
		if (renameItemId && renameItemId !== lastRenameRef.current) {
			lastRenameRef.current = renameItemId;
			setEditingItemId(renameItemId);
		}
	}, [renameItemId]);

	const popoverLine = barPopover
		? lines.find((line) => line.id === barPopover.lineId)
		: undefined;

	const panelDisplayOpen = isMobile ? mobilePanelOpen : isOpen;
	const panelDisplayWidth = isMobile ? PANEL_MIN_WIDTH : panelWidth;

	return (
		<div className="flex flex-col gap-3">
			{!readOnly && (
				<ZoomBar
					dayWidth={dayWidth}
					onChange={setDayWidth}
					isMobile={isMobile}
					onOpenPanel={() => setMobilePanelOpen((prev) => !prev)}
				/>
			)}

			<div
				className="relative grid border-y"
				style={
					{
						gridTemplateColumns: `${panelDisplayOpen ? panelDisplayWidth : 0}px 1fr`,
						"--board-panel-width": panelDisplayOpen
							? `${panelDisplayWidth}px`
							: "0px",
					} as React.CSSProperties
				}
			>
				{/* Left column: row labels */}
				<BoardSidePanel
					isOpen={panelDisplayOpen}
					width={panelDisplayWidth}
					assigneeWidth={assigneeWidth}
					allowPanelResize={!isMobile}
					onStartResize={startPanelResize}
					onStartRailOpen={startRailOpen}
					onStartAssigneeResize={startAssigneeResize}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onToggle={toggle}
				>
					<div
						className="flex items-end gap-1 border-b px-1 pb-2 text-muted-foreground text-xs"
						style={{ height: HEADER_HEIGHT }}
					>
						<span className="flex-1">Item</span>
						<span
							className="shrink-0 pl-1"
							style={{ width: "var(--board-assignee-width)" }}
						>
							Assignee
						</span>
						<span
							className="shrink-0 pl-1 text-right"
							style={{ width: DATE_COL_WIDTH }}
						>
							Start
						</span>
						<span
							className="shrink-0 pl-1 text-right"
							style={{ width: DATE_COL_WIDTH }}
						>
							End
						</span>
					</div>
					<div ref={rowsRef} className="relative">
						{rows.length === 0 ? (
							<div className="px-3 py-4 text-muted-foreground text-sm">
								{readOnly
									? "This project has no lines yet."
									: "No lines yet — add your first one."}
							</div>
						) : null}
						{rows.length === 0 && creatingAt === 0 && (
							<CreateLineRow
								depth={0}
								onCommit={async (text) => {
									await createLine(text, 0);
								}}
								onDone={() => setCreatingAt(null)}
							/>
						)}
						{rows.map(({ line, depth }, index) => (
							<Fragment key={line.id}>
								<div
									className="group relative flex items-center gap-1 border-b px-1"
									style={{
										height: ROW_HEIGHT,
										paddingLeft: 4 + depth * INDENT_PX,
									}}
								>
									{hasSelection && (
										<Checkbox
											checked={selectedIds?.has(line.id) ?? false}
											onCheckedChange={(checked) =>
												onToggleSelected(line.id, checked === true)
											}
											aria-label={`Select ${line.item}`}
										/>
									)}
									{!readOnly && (
										<button
											type="button"
											className="cursor-grab touch-none text-muted-foreground opacity-0 transition-opacity active:cursor-grabbing group-hover:opacity-100"
											onPointerDown={(event) => startReorder(event, line.id)}
											onPointerMove={onReorderMove}
											onPointerUp={() => void onReorderEnd()}
											onPointerCancel={() => void onReorderEnd()}
											aria-label={`Reorder ${line.item}`}
										>
											<DotsSixVerticalIcon className="size-4" />
										</button>
									)}
									{line.isGroup && (
										<RowsIcon className="size-4 shrink-0 text-muted-foreground" />
									)}
									<InlineTextEdit
										key={`${line.id}-${line.id === editingItemId}`}
										value={line.item}
										startActive={line.id === editingItemId}
										disabled={readOnly || !linesCollection}
										className={`min-w-0 flex-1 text-sm ${line.isGroup ? "font-medium" : ""}`}
										onCommit={(text) => commitField(line, "item", text)}
										onDone={
											line.id === editingItemId
												? () => setEditingItemId(null)
												: undefined
										}
									/>
									<div
										className="flex h-full shrink-0 items-center pl-1"
										style={{ width: "var(--board-assignee-width)" }}
									>
										<InlineTextEdit
											value={line.assignee ?? ""}
											disabled={readOnly || !linesCollection}
											allowEmpty
											className="h-full w-full text-muted-foreground text-xs"
											onCommit={(text) => commitField(line, "assignee", text)}
										/>
									</div>
									{!readOnly &&
										index < rows.length - 1 &&
										creatingAt === null && (
											<div className="pointer-events-none absolute inset-x-0 -bottom-2 z-10 flex h-4 items-center justify-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
												<button
													type="button"
													className="pointer-events-auto flex size-4 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground"
													onClick={() => setCreatingAt(index + 1)}
													aria-label={`Insert line after ${line.item}`}
												>
													<PlusIcon className="size-3" />
												</button>
											</div>
										)}
								</div>
								{creatingAt === index + 1 && (
									<CreateLineRow
										depth={createTarget(index + 1).depth}
										onCommit={async (text) => {
											await createLine(text, index + 1);
										}}
										onDone={() => setCreatingAt(null)}
									/>
								)}
							</Fragment>
						))}
						{/* Insertion point: the border the dragged Line would land on
						 * (same gap the drop uses, so they can't disagree), inset to
						 * the resolved depth. A null target = no-op drop (a Group into
						 * its own subtree), shown dimmed. */}
						{reorderHover && (
							<div
								className={`pointer-events-none absolute inset-x-0 z-10 h-0.5 ${
									reorderHover.target === null
										? "bg-muted-foreground/40"
										: "bg-primary"
								}`}
								style={{
									top: reorderHover.gap * ROW_HEIGHT - 1,
									left:
										ROW_BASE_X + (reorderHover.target?.depth ?? 0) * INDENT_PX,
								}}
							/>
						)}
					</div>
					{!readOnly && creatingAt === null && (
						<button
							type="button"
							className={`flex w-full items-center gap-2 px-3 text-left text-muted-foreground text-sm hover:bg-accent/50 hover:text-foreground ${
								rows.length === 0 ? "border-t" : ""
							}`}
							style={{ height: ROW_HEIGHT }}
							onClick={() => setCreatingAt(rows.length)}
						>
							<PlusIcon className="size-4" /> Add new line
						</button>
					)}
				</BoardSidePanel>

				{/* Right column: the timeline */}
				<div
					className="min-w-0 overflow-x-auto"
					ref={scrollerRef}
					onScroll={onTimelineScroll}
				>
					<div className="relative" style={{ width, height: svgHeight }}>
						<svg
							width={width}
							height={svgHeight}
							className="block text-border"
							role="img"
							aria-label={`Timeline of ${project.name}`}
						>
							<title>{`Timeline of ${project.name}`}</title>
							{/* Background: draw-to-create lives here, but only on the empty
							 * bottom band — rows that already have a Line are not targets.
							 * Decorative layers above stay pointer-events-none so this rect
							 * receives gestures; bars sit on top and take their own. */}
							<rect
								x={0}
								y={0}
								width={width}
								height={svgHeight}
								fill="transparent"
								className={
									readOnly
										? ""
										: hoverCell || createPreview
											? "cursor-cell touch-none"
											: hoverBlocked
												? "cursor-not-allowed touch-none"
												: "touch-none"
								}
								onPointerDown={onBackgroundDown}
								onPointerMove={onBackgroundMove}
								onPointerUp={onBackgroundUp}
								onPointerCancel={onBackgroundCancel}
								onPointerLeave={() => {
									if (!createDragRef.current) {
										setHoverCell(null);
										setHoverBlocked(false);
									}
								}}
							/>
							{/* Weekend shading (calendar days — shaded, not excluded) */}
							{weekends.map((span) => (
								<rect
									key={span.x}
									x={span.x}
									y={0}
									width={span.width}
									height={svgHeight}
									className="pointer-events-none fill-muted-foreground/10"
								/>
							))}

							{/* Tick gridlines */}
							{ticks.map((tick) => (
								<line
									key={tick.date}
									x1={tick.x}
									x2={tick.x}
									y1={HEADER_HEIGHT - 16}
									y2={svgHeight}
									stroke="currentColor"
									strokeOpacity={tick.major ? 0.9 : 0.35}
									className="pointer-events-none"
								/>
							))}

							{/* Row separators */}
							{rows.map(({ line }, index) => (
								<line
									key={line.id}
									x1={0}
									x2={width}
									y1={rowY(index) + ROW_HEIGHT - 0.5}
									y2={rowY(index) + ROW_HEIGHT - 0.5}
									stroke="currentColor"
									strokeOpacity={0.5}
									className="pointer-events-none"
								/>
							))}

							{/* Bars and milestone diamonds */}
							{rows.map(({ line }, index) => {
								const effective =
									preview?.lineId === line.id
										? {
												...line,
												startDate: preview.startDate,
												endDate: preview.endDate,
											}
										: line;
								const bar = barForLine(geom, effective);
								const color = assigneeColor(line.assignee);
								const cy = rowY(index) + ROW_HEIGHT / 2;
								const tooltip = line.isGroup
									? `${line.item}${line.assignee ? ` — ${line.assignee}` : ""} · ${effective.startDate} → ${effective.endDate}`
									: `${line.item}${line.assignee ? ` — ${line.assignee}` : ""} · ${effective.startDate} → ${effective.endDate}${line.isMilestone ? "" : ` · ${line.percentComplete}%`}`;

								// A Group's bar is automatic (derived from its Lines on
								// the server): a summary bar with angled end caps, no drag
								// handles, no popover.
								if (line.isGroup) {
									const capTop = cy - 3;
									const caps = groupCapPaths(bar.x, bar.width, capTop);
									return (
										<g key={line.id}>
											<title>{tooltip}</title>
											<rect
												x={bar.x + BAR_INSET}
												y={capTop}
												width={Math.max(bar.width - BAR_INSET * 2, 2)}
												height={6}
												rx={1.5}
												fill={color}
												fillOpacity={0.9}
											/>
											<path d={caps.left} fill={color} />
											<path d={caps.right} fill={color} />
										</g>
									);
								}

								if (bar.isMilestone) {
									return (
										<g
											key={line.id}
											className={readOnly ? "" : "cursor-grab touch-none"}
											onPointerDown={(event) => startDrag(event, line, "move")}
											onPointerMove={onDragMove}
											onPointerUp={onDragEnd}
											onClick={() => onBarClick(line.id)}
										>
											<title>{tooltip}</title>
											<path d={diamondPath(bar.x, cy)} fill={color} />
										</g>
									);
								}

								const barX = bar.x + BAR_INSET;
								const barW = Math.max(bar.width - BAR_INSET * 2, 2);
								return (
									<g
										key={line.id}
										onPointerMove={onDragMove}
										onPointerUp={onDragEnd}
										onClick={() => onBarClick(line.id)}
									>
										<title>{tooltip}</title>
										<rect
											x={barX}
											y={rowY(index) + 6}
											width={barW}
											height={ROW_HEIGHT - 12}
											rx={BAR_RADIUS}
											fill={color}
											fillOpacity={0.85}
											className={readOnly ? "" : "cursor-grab touch-none"}
											onPointerDown={(event) => startDrag(event, line, "move")}
										/>
										{line.percentComplete > 0 ? (
											<rect
												x={barX}
												y={rowY(index) + 6}
												width={(barW * line.percentComplete) / 100}
												height={ROW_HEIGHT - 12}
												rx={BAR_RADIUS}
												fill="#000"
												fillOpacity={0.35}
												className="pointer-events-none"
											/>
										) : null}
										{!readOnly && (
											<>
												<rect
													x={bar.x - 3}
													y={rowY(index) + 4}
													width={7}
													height={ROW_HEIGHT - 8}
													fill="transparent"
													className="cursor-ew-resize touch-none"
													onPointerDown={(event) =>
														startDrag(event, line, "resize-start")
													}
												/>
												<rect
													x={bar.x + bar.width - 4}
													y={rowY(index) + 4}
													width={7}
													height={ROW_HEIGHT - 8}
													fill="transparent"
													className="cursor-ew-resize touch-none"
													onPointerDown={(event) =>
														startDrag(event, line, "resize-end")
													}
												/>
											</>
										)}
									</g>
								);
							})}

							{/* Axis labels on top */}
							{ticks.map((tick) => (
								<text
									key={`label-${tick.date}`}
									x={tick.x + 4}
									y={HEADER_HEIGHT - 22}
									className={`pointer-events-none fill-muted-foreground text-[11px] ${tick.major ? "font-medium" : ""}`}
								>
									{tick.label}
								</text>
							))}
						</svg>

						{/* Draw-to-create: hover ghost ("+" day cell) and drag span preview */}
						{!readOnly && hoverCell && !createPreview && (
							<div
								className="pointer-events-none absolute flex items-center justify-center rounded-sm border border-muted-foreground/60 border-dashed text-muted-foreground"
								style={{
									left: dateToX(geom, hoverCell.date),
									top: rowY(hoverCell.row) + 6,
									width: dayWidth,
									height: ROW_HEIGHT - 12,
								}}
							>
								{dayWidth >= 16 && <PlusIcon className="size-3" />}
							</div>
						)}
						{createPreview && (
							<div
								className="pointer-events-none absolute rounded-sm border border-primary border-dashed bg-primary/10"
								style={{
									left: dateToX(geom, createPreview.startDate),
									top: rowY(createPreview.row) + 6,
									width:
										(diffDays(createPreview.startDate, createPreview.endDate) +
											1) *
										dayWidth,
									height: ROW_HEIGHT - 12,
								}}
							/>
						)}

						{/* DOM overlay: Notes rendered on the bars (CONTEXT.md) */}
						{rows.map(({ line }, index) => {
							if (!line.note) return null;
							const effective =
								preview?.lineId === line.id
									? {
											...line,
											startDate: preview.startDate,
											endDate: preview.endDate,
										}
									: line;
							const bar = barForLine(geom, effective);
							const top = rowY(index) + ROW_HEIGHT / 2 - 7;
							if (bar.isMilestone) {
								return (
									<div
										key={`note-${line.id}`}
										className="pointer-events-none absolute w-48 truncate text-[11px] text-muted-foreground"
										style={{ left: bar.x + DIAMOND_SIZE + 4, top }}
									>
										{line.note}
									</div>
								);
							}
							return (
								<div
									key={`note-${line.id}`}
									className="pointer-events-none absolute truncate text-[11px] text-white"
									style={{
										left: bar.x + 6,
										top,
										width: Math.max(bar.width - 12, 24),
									}}
								>
									{line.note}
								</div>
							);
						})}
					</div>
				</div>

				{/* Offscreen nudges: an arrow toward each bar outside the window,
				 * pinned to the timeline's visible edges (the grid doesn't scroll
				 * — the timeline column inside it does). The left offset clears
				 * the resizable rows panel. */}
				{rows.map(({ line }, index) => {
					const side = viewport ? offscreenSide(geom, line, viewport) : null;
					if (!side) return null;
					return (
						<div
							key={`offscreen-${line.id}`}
							className="pointer-events-none absolute z-10 text-muted-foreground"
							style={{
								top: rowY(index) + ROW_HEIGHT / 2 - 7,
								...(side === "left"
									? { left: "calc(var(--board-panel-width) + 4px)" }
									: { right: 4 }),
							}}
						>
							{side === "left" ? (
								<CaretLeftIcon className="size-3.5" />
							) : (
								<CaretRightIcon className="size-3.5" />
							)}
						</div>
					);
				})}
			</div>

			{/* Drag ghost following the cursor during a row reorder */}
			{reorderHover && (
				<ReorderDragPreview
					item={
						lines.find((line) => line.id === reorderHover.lineId)?.item ?? ""
					}
					x={reorderHover.x}
					y={reorderHover.y}
				/>
			)}

			{!readOnly &&
				linesCollection &&
				barPopover &&
				popoverLine &&
				!popoverLine.isGroup && (
					<BarPopover
						key={barPopover.lineId}
						line={popoverLine}
						collection={linesCollection}
						anchor={barPopover.anchor}
						// Guarded: clicking bar B while bar A's popover is open also fires
						// A's outside-press dismissal (same click) — that must not close B.
						onClose={() =>
							setBarPopover((prev) =>
								prev?.lineId === popoverLine.id ? null : prev,
							)
						}
					/>
				)}
		</div>
	);
}

/** A row-shaped inline input for creating a Line — sits in the flow exactly
 * where the new row will land, so the Board stays put. */
function CreateLineRow({
	depth,
	onCommit,
	onDone,
}: {
	depth: number;
	onCommit: (text: string) => Promise<void>;
	onDone: () => void;
}) {
	return (
		<div
			className="flex items-center gap-1 border-b px-1"
			style={{ height: ROW_HEIGHT, paddingLeft: 4 + depth * INDENT_PX }}
		>
			{/* Spacer aligns the input with the Item column text (checkbox +
			 * drag handle widths) */}
			<span className="w-9 shrink-0" />
			<InlineTextEdit
				value=""
				startActive
				placeholder="New line item"
				className="min-w-0 flex-1 text-sm"
				onCommit={onCommit}
				onDone={onDone}
			/>
			<div
				className="shrink-0"
				style={{ width: "var(--board-assignee-width)" }}
			/>
			{/* Spacers keep the create row the same width as populated rows */}
			<span className="shrink-0" style={{ width: DATE_COL_WIDTH }} />
			<span className="shrink-0" style={{ width: DATE_COL_WIDTH }} />
		</div>
	);
}
