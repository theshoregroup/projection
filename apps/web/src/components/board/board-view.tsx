import {
	DotsSixVerticalIcon,
	PlusIcon,
} from "@phosphor-icons/react/dist/ssr";
import { addDays, deriveWindow } from "@projection/api/domain/dates";
import { sortOrderBetween } from "@projection/api/domain/ordering";
import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";

import InlineLineForm from "@/components/board/inline-line-form";
import LineDialog from "@/components/board/line-dialog";
import ZoomBar from "@/components/board/zoom-bar";
import { assigneeColor } from "@/lib/board-layout/colors";
import {
	barForLine,
	boardHeight,
	boardWidth,
	DEFAULT_DAY_WIDTH,
	type Geometry,
	HEADER_HEIGHT,
	ROW_HEIGHT,
	rowY,
	ticksFor,
	weekendSpans,
} from "@/lib/board-layout/geometry";
import type { getLinesCollection, LineRow } from "@/lib/collections";
import { useTRPCClient } from "@/utils/trpc";

type LinesCollection = ReturnType<typeof getLinesCollection>;

interface BoardViewProps {
	project: { id: string; name: string; seedStart: string; seedEnd: string };
	lines: LineRow[];
	/** Read-only render for the public Share Link — no controls, no mutations. */
	readOnly?: boolean;
	linesCollection?: LinesCollection;
}

type DragMode = "move" | "resize-start" | "resize-end";

interface DragState {
	mode: DragMode;
	lineId: string;
	pointerStartX: number;
	origStart: string;
	origEnd: string;
}

const BAR_INSET = 1;
const BAR_RADIUS = 4;
const DIAMOND_SIZE = 9;

function diamondPath(cx: number, cy: number): string {
	return `M ${cx} ${cy - DIAMOND_SIZE} L ${cx + DIAMOND_SIZE} ${cy} L ${cx} ${cy + DIAMOND_SIZE} L ${cx - DIAMOND_SIZE} ${cy} Z`;
}

/** Neighbours a dragged row would land between at a hovered row index. */
export function computeReorderTargets(
	lines: LineRow[],
	lineId: string,
	targetIndex: number,
): { beforeId: string | null; afterId: string | null } {
	const current = lines.findIndex((line) => line.id === lineId);
	const rest = lines.filter((line) => line.id !== lineId);
	const insertAt = targetIndex > current ? targetIndex + 1 : targetIndex;
	return {
		beforeId: rest[insertAt - 1]?.id ?? null,
		afterId: rest[insertAt]?.id ?? null,
	};
}

export default function BoardView({
	project,
	lines,
	readOnly = false,
	linesCollection,
}: BoardViewProps) {
	const trpcClient = useTRPCClient();
	const queryClient = useQueryClient();

	const [dayWidth, setDayWidth] = useState(DEFAULT_DAY_WIDTH);
	const [preview, setPreview] = useState<{
		lineId: string;
		startDate: string;
		endDate: string;
	} | null>(null);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [editingLine, setEditingLine] = useState<LineRow | null>(null);
	/** Row index the inline creation panel inserts at (null = closed). */
	const [createAt, setCreateAt] = useState<number | null>(null);
	const [reorderHover, setReorderHover] = useState<{
		lineId: string;
		index: number;
	} | null>(null);

	const dragRef = useRef<DragState | null>(null);
	const reorderRef = useRef<{ lineId: string } | null>(null);
	const rowsRef = useRef<HTMLDivElement | null>(null);

	const window = deriveWindow(lines, project);
	const geom: Geometry = { start: window.start, end: window.end, dayWidth };
	const width = boardWidth(geom);
	const height = boardHeight(lines.length);
	const ticks = ticksFor(geom);
	const weekends = weekendSpans(geom);

	function openEdit(line: LineRow) {
		if (readOnly) return;
		setEditingLine(line);
		setDialogOpen(true);
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
		};
	}

	function onDragMove(event: React.PointerEvent) {
		const drag = dragRef.current;
		if (!drag) return;
		const deltaDays = Math.round(
			(event.clientX - drag.pointerStartX) / dayWidth,
		);
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
		if (drag && preview && preview.lineId === drag.lineId && linesCollection) {
			const { startDate, endDate } = preview;
			linesCollection.update(drag.lineId, (draft) => {
				draft.startDate = startDate;
				draft.endDate = endDate;
			});
		}
		setPreview(null);
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
				lines.length - 1,
				Math.floor((event.clientY - rect.top) / ROW_HEIGHT),
			),
		);
		setReorderHover({ lineId: reorderRef.current.lineId, index });
	}

	async function onReorderEnd() {
		const reorder = reorderRef.current;
		reorderRef.current = null;
		setReorderHover(null);
		if (!reorder || !linesCollection) return;
		const hoverIndex =
			reorderHover?.index ?? lines.findIndex((l) => l.id === reorder.lineId);
		const targets = computeReorderTargets(lines, reorder.lineId, hoverIndex);
		const before = targets.beforeId
			? (lines.find((l) => l.id === targets.beforeId)?.sortOrder ?? null)
			: null;
		const after = targets.afterId
			? (lines.find((l) => l.id === targets.afterId)?.sortOrder ?? null)
			: null;
		// Optimistic local order; persisted via the reorder endpoint (the
		// collection's update handler deliberately ignores sortOrder changes)
		linesCollection.update(reorder.lineId, (draft) => {
			draft.sortOrder = sortOrderBetween(before, after);
		});
		try {
			await trpcClient.lines.reorder.mutate({
				projectId: project.id,
				lineId: reorder.lineId,
				beforeLineId: targets.beforeId,
				afterLineId: targets.afterId,
			});
			await queryClient.invalidateQueries({
				queryKey: ["collection", "lines", project.id],
			});
		} catch {
			toast.error("Couldn't reorder — try again.");
		}
	}

	// --- Render ---------------------------------------------------------------

	return (
		<div className="flex flex-col gap-3">
			{!readOnly && (

					<ZoomBar dayWidth={dayWidth} onChange={setDayWidth} />

			)}

			<div
				className="relative grid border-y"
				style={{ gridTemplateColumns: "260px 1fr" }}
			>
				{/* Left column: row labels */}
				<div className="border-r">
					<div
						className="flex items-end gap-2 border-b px-2 pb-2 text-muted-foreground text-xs"
						style={{ height: HEADER_HEIGHT }}
					>
						<span className="flex-1">Item</span>
						<span className="w-20">Assignee</span>
					</div>
					<div ref={rowsRef}>
						{lines.length === 0 ? (
							<div className="px-3 py-4 text-muted-foreground text-sm">
								{readOnly
									? "This project has no lines yet."
									: "No lines yet — add your first one."}
							</div>
						) : null}
						{lines.map((line, index) => (
							<div
								key={line.id}
								className={`group relative flex items-center gap-1 border-b px-1 ${
									reorderHover?.index === index &&
									reorderHover.lineId !== line.id
										? "bg-accent/50"
										: ""
								}`}
								style={{ height: ROW_HEIGHT }}
							>
								{!readOnly && (
									<button
										type="button"
										className="cursor-grab touch-none text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
										onPointerDown={(event) => startReorder(event, line.id)}
										onPointerMove={onReorderMove}
										onPointerUp={() => void onReorderEnd()}
										aria-label={`Reorder ${line.item}`}
									>
										<DotsSixVerticalIcon className="size-4" />
									</button>
								)}
								<button
									type="button"
									className="flex-1 truncate text-left text-sm hover:underline disabled:cursor-default disabled:no-underline"
									onClick={() => openEdit(line)}
									disabled={readOnly}
								>
									{line.item}
								</button>
								<span className="w-20 truncate text-muted-foreground text-xs">
									{line.assignee}
								</span>
								{!readOnly && index < lines.length - 1 && createAt === null && (
									<div className="pointer-events-none absolute inset-x-0 -bottom-2 z-10 flex h-4 items-center justify-center opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
										<button
											type="button"
											className="pointer-events-auto flex size-4 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground"
											onClick={() => setCreateAt(index + 1)}
											aria-label={`Insert line after ${line.item}`}
										>
											<PlusIcon className="size-3" />
										</button>
									</div>
								)}
							</div>
						))}
					</div>
					{!readOnly && createAt === null && (
						<button
							type="button"
							className={`flex w-full items-center gap-2 px-3 text-left text-muted-foreground text-sm hover:bg-accent/50 hover:text-foreground ${
								lines.length === 0 ? "border-t" : ""
							}`}
							style={{ height: ROW_HEIGHT }}
							onClick={() => setCreateAt(lines.length)}
						>
							<PlusIcon className="size-4" /> Add new line
						</button>
					)}
				</div>

				{/* Right column: the timeline */}
				<div className="overflow-x-auto">
					<div className="relative" style={{ width, height }}>
						<svg
							width={width}
							height={height}
							className="block text-border"
							role="img"
							aria-label={`Timeline of ${project.name}`}
						>
							<title>{`Timeline of ${project.name}`}</title>
							{/* Weekend shading (calendar days — shaded, not excluded) */}
							{weekends.map((span) => (
								<rect
									key={span.x}
									x={span.x}
									y={0}
									width={span.width}
									height={height}
									className="fill-muted-foreground/10"
								/>
							))}

							{/* Tick gridlines */}
							{ticks.map((tick) => (
								<line
									key={tick.date}
									x1={tick.x}
									x2={tick.x}
									y1={HEADER_HEIGHT - 16}
									y2={height}
									stroke="currentColor"
									strokeOpacity={tick.major ? 0.9 : 0.35}
								/>
							))}

							{/* Row separators */}
							{lines.map((line, index) => (
								<line
									key={line.id}
									x1={0}
									x2={width}
									y1={rowY(index) + ROW_HEIGHT - 0.5}
									y2={rowY(index) + ROW_HEIGHT - 0.5}
									stroke="currentColor"
									strokeOpacity={0.5}
								/>
							))}

							{/* Bars and milestone diamonds */}
							{lines.map((line, index) => {
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
								const tooltip = `${line.item}${line.assignee ? ` — ${line.assignee}` : ""} · ${effective.startDate} → ${effective.endDate}${line.isMilestone ? "" : ` · ${line.percentComplete}%`}`;

								if (bar.isMilestone) {
									return (
										<g
											key={line.id}
											className={readOnly ? "" : "cursor-grab touch-none"}
											onPointerDown={(event) => startDrag(event, line, "move")}
											onPointerMove={onDragMove}
											onPointerUp={onDragEnd}
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
									className={`fill-muted-foreground text-[11px] ${tick.major ? "font-medium" : ""}`}
								>
									{tick.label}
								</text>
							))}
						</svg>

						{/* DOM overlay: Notes rendered on the bars (CONTEXT.md) */}
						{lines.map((line, index) => {
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

				{!readOnly && createAt !== null && (
					<InlineLineForm
						key={createAt}
						projectId={project.id}
						top={HEADER_HEIGHT + createAt * ROW_HEIGHT}
						beforeLine={lines[createAt - 1] ?? null}
						afterLine={lines[createAt] ?? null}
						onClose={() => setCreateAt(null)}
					/>
				)}
			</div>

			{!readOnly && linesCollection && editingLine && (
				<LineDialog
					open={dialogOpen}
					onOpenChange={setDialogOpen}
					line={editingLine}
					collection={linesCollection}
				/>
			)}
		</div>
	);
}
