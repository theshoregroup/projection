import { addDays, diffDays } from "@projection/api/domain/dates";
import { Button } from "@projection/ui/components/button";
import { Checkbox } from "@projection/ui/components/checkbox";
import { Input } from "@projection/ui/components/input";
import { Label } from "@projection/ui/components/label";
import {
	Popover,
	PopoverPopup,
	PopoverPortal,
	PopoverPositioner,
} from "@projection/ui/components/popover";
import { Textarea } from "@projection/ui/components/textarea";
import { useState } from "react";
import { toast } from "sonner";

import type { getLinesCollection, LineRow } from "@/lib/collections";

type LinesCollection = ReturnType<typeof getLinesCollection>;

interface BarPopoverProps {
	line: LineRow;
	collection: LinesCollection;
	/** The bar element clicked on the Timeline — the popover's anchor. */
	anchor: Element;
	onClose: () => void;
}

/** Popover anchored to a Timeline bar: Milestone toggle, dates, and Note.
 * Dates stay draggable on the bar — these inputs write through to the same
 * collection, so both stay in sync. */
export default function BarPopover({
	line,
	collection,
	anchor,
	onClose,
}: BarPopoverProps) {
	const [note, setNote] = useState(line.note ?? "");
	const [confirmDelete, setConfirmDelete] = useState(false);

	async function update(
		changes: Partial<
			Pick<LineRow, "startDate" | "endDate" | "isMilestone" | "note">
		>,
	) {
		try {
			await collection.update(line.id, (draft) => {
				Object.assign(draft, changes);
			}).isPersisted.promise;
		} catch {
			// The collection rolled the optimistic change back
			toast.error("Couldn't save — your change was undone. Try again.");
		}
	}

	function onStartChange(nextStart: string) {
		if (!nextStart || nextStart === line.startDate) return;
		if (line.isMilestone) {
			void update({ startDate: nextStart, endDate: nextStart });
			return;
		}
		// Keep the bar's length — moving Start moves End with it
		const delta = diffDays(line.startDate, nextStart);
		void update({
			startDate: nextStart,
			endDate: addDays(line.endDate, delta),
		});
	}

	function onEndChange(nextEnd: string) {
		if (!nextEnd || nextEnd === line.endDate) return;
		void update({
			endDate: nextEnd < line.startDate ? line.startDate : nextEnd,
		});
	}

	function onMilestoneChange(checked: boolean) {
		// A Milestone occupies a single day (CONTEXT.md); toggling back leaves a
		// one-day bar to extend from.
		if (checked) void update({ isMilestone: true, endDate: line.startDate });
		else void update({ isMilestone: false });
	}

	function commitNote() {
		const text = note.trim();
		if (text === (line.note ?? "")) return;
		void update({ note: text || null });
	}

	/** Two-step: first click arms, second deletes (no dialogs on the Board). */
	async function onDelete() {
		if (!confirmDelete) {
			setConfirmDelete(true);
			return;
		}
		try {
			await collection.delete(line.id).isPersisted.promise;
			onClose();
		} catch {
			// The collection rolled the optimistic change back
			toast.error("Couldn't delete — your change was undone. Try again.");
			setConfirmDelete(false);
		}
	}

	return (
		<Popover
			open
			onOpenChange={(open) => {
				if (!open) {
					commitNote();
					onClose();
				}
			}}
		>
			<PopoverPortal>
				<PopoverPositioner
					anchor={anchor}
					side="bottom"
					align="center"
					sideOffset={8}
				>
					<PopoverPopup className="w-64 space-y-3 p-3 text-sm">
						<div className="flex items-center gap-2">
							<Checkbox
								id="bar-milestone"
								checked={line.isMilestone}
								onCheckedChange={(checked) =>
									onMilestoneChange(checked === true)
								}
							/>
							<Label htmlFor="bar-milestone">Milestone (single day)</Label>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div className="space-y-1.5">
								<Label htmlFor="bar-start">
									{line.isMilestone ? "Date" : "Start"}
								</Label>
								<Input
									id="bar-start"
									type="date"
									value={line.startDate}
									onChange={(event) => onStartChange(event.target.value)}
								/>
							</div>
							{!line.isMilestone && (
								<div className="space-y-1.5">
									<Label htmlFor="bar-end">End</Label>
									<Input
										id="bar-end"
										type="date"
										value={line.endDate}
										onChange={(event) => onEndChange(event.target.value)}
									/>
								</div>
							)}
						</div>
						<div className="space-y-1.5">
							<Label htmlFor="bar-note">Note (shows on the bar)</Label>
							<Textarea
								id="bar-note"
								value={note}
								onChange={(event) => setNote(event.target.value)}
								onBlur={commitNote}
								rows={2}
							/>
						</div>
						<div className="border-border border-t pt-3">
							<Button
								type="button"
								variant={confirmDelete ? "destructive" : "ghost"}
								size="sm"
								className="w-full"
								onClick={() => void onDelete()}
							>
								{confirmDelete
									? "Click again to delete this line"
									: "Delete line"}
							</Button>
						</div>
					</PopoverPopup>
				</PopoverPositioner>
			</PopoverPortal>
		</Popover>
	);
}
