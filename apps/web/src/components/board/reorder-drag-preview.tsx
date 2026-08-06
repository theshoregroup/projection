import { DotsSixVerticalIcon } from "@phosphor-icons/react/dist/ssr";

/** Drag ghost that follows the pointer while reordering rows: the grab
 * handle and Item name on a bordered chip. Fixed-position and
 * pointer-events-none so it never interferes with the drop. */
export default function ReorderDragPreview({
	item,
	x,
	y,
}: {
	item: string;
	x: number;
	y: number;
}) {
	return (
		<div
			className="pointer-events-none fixed z-50 flex max-w-56 items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-sm shadow-sm"
			style={{ left: x + 12, top: y + 12 }}
		>
			<DotsSixVerticalIcon className="size-4 shrink-0 text-muted-foreground" />
			<span className="truncate">{item}</span>
		</div>
	);
}
