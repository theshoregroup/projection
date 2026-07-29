import { sortOrderAtEnd } from "@projection/api/domain/ordering";
import { Button } from "@projection/ui/components/button";
import { Checkbox } from "@projection/ui/components/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@projection/ui/components/dialog";
import { Input } from "@projection/ui/components/input";
import { Label } from "@projection/ui/components/label";
import { Slider } from "@projection/ui/components/slider";
import { Textarea } from "@projection/ui/components/textarea";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { getLinesCollection, LineRow } from "@/lib/collections";

type LinesCollection = ReturnType<typeof getLinesCollection>;

interface LineDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	projectId: string;
	/** The Line being edited, or null to create one. */
	line: LineRow | null;
	/** Current Lines (for appending sort order on create). */
	lines: LineRow[];
	collection: LinesCollection;
}

export default function LineDialog({
	open,
	onOpenChange,
	projectId,
	line,
	lines,
	collection,
}: LineDialogProps) {
	const [item, setItem] = useState("");
	const [startDate, setStartDate] = useState("");
	const [endDate, setEndDate] = useState("");
	const [assignee, setAssignee] = useState("");
	const [note, setNote] = useState("");
	const [percentComplete, setPercentComplete] = useState(0);
	const [isMilestone, setIsMilestone] = useState(false);
	const [saving, setSaving] = useState(false);

	// Reset the form whenever the dialog targets a different Line
	useEffect(() => {
		if (!open) return;
		setItem(line?.item ?? "");
		setStartDate(line?.startDate ?? "");
		setEndDate(line?.endDate ?? "");
		setAssignee(line?.assignee ?? "");
		setNote(line?.note ?? "");
		setPercentComplete(line?.percentComplete ?? 0);
		setIsMilestone(line?.isMilestone ?? false);
	}, [open, line]);

	const effectiveEnd = isMilestone ? startDate : endDate;
	const canSubmit =
		item.trim().length > 0 &&
		startDate.length > 0 &&
		effectiveEnd.length > 0 &&
		startDate <= effectiveEnd &&
		!saving;

	async function persist(
		action: () => { isPersisted: { promise: Promise<unknown> } },
	) {
		setSaving(true);
		try {
			await action().isPersisted.promise;
			onOpenChange(false);
		} catch {
			// The collection rolled the optimistic change back
			toast.error("Couldn't save — your change was undone. Try again.");
		} finally {
			setSaving(false);
		}
	}

	const submit = () => {
		if (!canSubmit) return;
		const values = {
			item: item.trim(),
			startDate,
			endDate: effectiveEnd,
			assignee: assignee.trim() || null,
			note: note.trim() || null,
			percentComplete,
			isMilestone,
		};
		if (line) {
			void persist(() =>
				collection.update(line.id, (draft) => {
					Object.assign(draft, values);
				}),
			);
		} else {
			const now = new Date().toISOString();
			void persist(() =>
				collection.insert({
					...values,
					id: crypto.randomUUID(),
					projectId,
					sortOrder: sortOrderAtEnd(lines.map((row) => row.sortOrder)),
					createdAt: now,
					updatedAt: now,
				} satisfies LineRow),
			);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{line ? "Edit line" : "New line"}</DialogTitle>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						submit();
					}}
				>
					<div className="space-y-2">
						<Label htmlFor="line-item">Item</Label>
						<Input
							id="line-item"
							value={item}
							onChange={(event) => setItem(event.target.value)}
							placeholder="Design the thing"
							required
						/>
					</div>
					<div className="flex items-center gap-2">
						<Checkbox
							id="line-milestone"
							checked={isMilestone}
							onCheckedChange={(checked) => setIsMilestone(checked === true)}
						/>
						<Label htmlFor="line-milestone">Milestone (single day)</Label>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="line-start">
								{isMilestone ? "Date" : "Start"}
							</Label>
							<Input
								id="line-start"
								type="date"
								value={startDate}
								onChange={(event) => setStartDate(event.target.value)}
								required
							/>
						</div>
						{!isMilestone && (
							<div className="space-y-2">
								<Label htmlFor="line-end">End</Label>
								<Input
									id="line-end"
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
					<div className="space-y-2">
						<Label htmlFor="line-assignee">Assignee</Label>
						<Input
							id="line-assignee"
							value={assignee}
							onChange={(event) => setAssignee(event.target.value)}
							placeholder="Liam"
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="line-note">Note (shows on the bar)</Label>
						<Textarea
							id="line-note"
							value={note}
							onChange={(event) => setNote(event.target.value)}
							rows={2}
						/>
					</div>
					{!isMilestone && (
						<div className="space-y-2">
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
					<DialogFooter>
						<Button type="submit" disabled={!canSubmit}>
							{saving ? "Saving…" : line ? "Save changes" : "Add line"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
