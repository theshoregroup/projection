import { Button } from "@projection/ui/components/button";
import { Checkbox } from "@projection/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@projection/ui/components/dialog";
import { Input } from "@projection/ui/components/input";
import { Label } from "@projection/ui/components/label";
import { Slider } from "@projection/ui/components/slider";
import { Textarea } from "@projection/ui/components/textarea";
import { useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import type { LineRow } from "@/lib/collections";
import { useTRPCClient } from "@/utils/trpc";

interface InlineLineFormProps {
	projectId: string;
	/** Vertical offset (px) of the insertion boundary within the Board grid. */
	top: number;
	/** Neighbours the new Line lands between (for its row order). */
	beforeLine: LineRow | null;
	afterLine: LineRow | null;
	onClose: () => void;
}

/** Inline creation panel for a Line — used at the bottom of the Board and
 * between rows. Overlays the timeline so existing rows never shift. */
export default function InlineLineForm({
	projectId,
	top,
	beforeLine,
	afterLine,
	onClose,
}: InlineLineFormProps) {
	const trpcClient = useTRPCClient();
	const queryClient = useQueryClient();

	const [item, setItem] = useState("");
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [assignee, setAssignee] = useState("");
	const [note, setNote] = useState("");
	const [percentComplete, setPercentComplete] = useState(0);
	const [isMilestone, setIsMilestone] = useState(false);
	const [saving, setSaving] = useState(false);

	const isDirty =
		item.trim().length > 0 ||
		startDate.length > 0 ||
		endDate.length > 0 ||
		assignee.trim().length > 0 ||
		note.trim().length > 0 ||
		percentComplete !== 0 ||
		isMilestone;

	// Block navigation only while the form holds input. The callback must stay
	// referentially stable — the blocker effect re-registers on identity
	// change, which would orphan a pending blocked navigation.
	const shouldBlockFn = useCallback(() => true, []);
	const blocker = useBlocker({
		shouldBlockFn,
		enableBeforeUnload: isDirty,
		disabled: !isDirty,
		withResolver: true,
	});

	const effectiveEnd = isMilestone ? startDate : endDate;
	const canSubmit =
		item.trim().length > 0 &&
		startDate.length > 0 &&
		effectiveEnd.length > 0 &&
		startDate <= effectiveEnd &&
		!saving;

	async function submit() {
		if (!canSubmit) return;
		setSaving(true);
		try {
			await trpcClient.lines.create.mutate({
				projectId,
				item: item.trim(),
				startDate,
				endDate: effectiveEnd,
				assignee: assignee.trim() || undefined,
				note: note.trim() || undefined,
				percentComplete,
				isMilestone,
				beforeLineId: beforeLine?.id ?? null,
				afterLineId: afterLine?.id ?? null,
			});
			// The lines collection syncs off this query key (see lib/collections)
			await queryClient.invalidateQueries({
				queryKey: ["collection", "lines", projectId],
			});
			onClose();
		} catch {
			toast.error("Couldn't save — try again.");
		} finally {
			setSaving(false);
		}
	}

	return (
		<>
			<form
				className="absolute left-0 z-10 w-[min(30rem,100%)] space-y-3 rounded-md border bg-popover p-3 text-popover-foreground shadow-lg"
				style={{ top }}
				onSubmit={(event) => {
					event.preventDefault();
					void submit();
				}}
				onKeyDown={(event) => {
					if (event.key === "Escape") onClose();
				}}
			>
				<div className="space-y-1.5">
					<Label htmlFor="new-line-item">Item</Label>
					<Input
						id="new-line-item"
						value={item}
						onChange={(event) => setItem(event.target.value)}
						placeholder="Design the thing"
						autoFocus
						required
					/>
				</div>
				<div className="flex items-center gap-2">
					<Checkbox
						id="new-line-milestone"
						checked={isMilestone}
						onCheckedChange={(checked) => setIsMilestone(checked === true)}
					/>
					<Label htmlFor="new-line-milestone">Milestone (single day)</Label>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<div className="space-y-1.5">
						<Label htmlFor="new-line-start">
							{isMilestone ? "Date" : "Start"}
						</Label>
						<Input
							id="new-line-start"
							type="date"
							value={startDate}
							onChange={(event) => setStartDate(event.target.value)}
							required
						/>
					</div>
					{!isMilestone && (
						<div className="space-y-1.5">
							<Label htmlFor="new-line-end">End</Label>
							<Input
								id="new-line-end"
								type="date"
								value={endDate}
								onChange={(event) => setEndDate(event.target.value)}
								required
							/>
						</div>
					)}
				</div>
				{!isMilestone && startDate > endDate && endDate.length > 0 ? (
					<p className="text-destructive text-sm">
						End must be on or after Start.
					</p>
				) : null}
				<div className="space-y-1.5">
					<Label htmlFor="new-line-assignee">Assignee</Label>
					<Input
						id="new-line-assignee"
						value={assignee}
						onChange={(event) => setAssignee(event.target.value)}
						placeholder="Liam"
					/>
				</div>
				<div className="space-y-1.5">
					<Label htmlFor="new-line-note">Note (shows on the bar)</Label>
					<Textarea
						id="new-line-note"
						value={note}
						onChange={(event) => setNote(event.target.value)}
						rows={2}
					/>
				</div>
				{!isMilestone && (
					<div className="space-y-1.5">
						<Label>% complete — {percentComplete}%</Label>
						<Slider
							min={0}
							max={100}
							step={5}
							value={[percentComplete]}
							onValueChange={(value) =>
								setPercentComplete(
									Array.isArray(value) ? (value[0] ?? 0) : value,
								)
							}
						/>
					</div>
				)}
				<div className="flex items-center justify-end gap-2">
					<Button type="button" variant="ghost" size="sm" onClick={onClose}>
						Cancel
					</Button>
					<Button type="submit" size="sm" disabled={!canSubmit}>
						{saving ? "Saving…" : "Add line"}
					</Button>
				</div>
			</form>

			{blocker.status === "blocked" && (
				<Dialog
					open
					onOpenChange={(open) => {
						if (!open) blocker.reset();
					}}
				>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Discard unsaved line?</DialogTitle>
							<DialogDescription>
								You have an unfinished line. Leaving now will discard it.
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button variant="outline" onClick={() => blocker.reset()}>
								Keep editing
							</Button>
							<Button variant="destructive" onClick={() => blocker.proceed()}>
								Discard
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}
		</>
	);
}
