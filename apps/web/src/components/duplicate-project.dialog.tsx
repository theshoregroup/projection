import { Button } from "@projection/ui/components/button";
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
import { QuerySuspenseBoundary } from "@projection/ui/components/query";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";

import { useTRPC } from "@/utils/trpc";
import { defineDialog } from "@/utils/dialogs/define-dialog";

export const projectDuplicateDialog = defineDialog({
	schema: z.object({
		dialogKey: z.literal("project:duplicate"),
		dialogId: z.uuid(),
	}),
});

function Content() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const control = projectDuplicateDialog.useControl();
	const projectId = control.dialogId ?? "";

	const { data: { project } } = useSuspenseQuery(
		trpc.projects.byId.queryOptions({ id: projectId }),
	);

	const [name, setName] = useState(`${project.name} (copy)`);
	const [newStartDate, setNewStartDate] = useState(project.seedStart);

	// Resync when the dialog reopens with a different project
	const [lastSeenOpen, setLastSeenOpen] = useState(false);
	if (control.open && !lastSeenOpen) {
		setName(`${project.name} (copy)`);
		setNewStartDate(project.seedStart);
	}
	if (control.open !== lastSeenOpen) {
		setLastSeenOpen(control.open);
	}

	// Compute shifted dates reactively
	const dayOffset = diffDays(project.seedStart, newStartDate);
	const previewStart = addDays(project.seedStart, dayOffset);
	const previewEnd = addDays(project.seedEnd, dayOffset);

	const duplicate = useMutation(
		trpc.projects.duplicate.mutationOptions({
			onSuccess: async (created) => {
				await queryClient.invalidateQueries({
					queryKey: ["collection", "projects"],
				});
				control.onOpenChange(false);
				toast.success(`Duplicated as "${created.name}"`);
				navigate({
					to: "/projects/$projectId",
					params: { projectId: created.id },
				});
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const trimmed = name.trim();
	const canSubmit = trimmed.length > 0 && !duplicate.isPending;

	return (
		<>
			<DialogHeader>
				<DialogTitle>Duplicate project</DialogTitle>
				<DialogDescription>
					Create a copy of this project. Choose a name and optionally set a new
					start date to shift all items.
				</DialogDescription>
			</DialogHeader>
			<form
				className="space-y-4"
				onSubmit={(event) => {
					event.preventDefault();
					if (!canSubmit) return;
					duplicate.mutate({
						id: project.id,
						name: trimmed,
						newStartDate,
					});
				}}
			>
				<div className="space-y-2">
					<Label htmlFor="duplicate-name">Name</Label>
					<Input
						id="duplicate-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						required
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="duplicate-start-date">New start date</Label>
					<Input
						id="duplicate-start-date"
						type="date"
						value={newStartDate}
						onChange={(event) => setNewStartDate(event.target.value)}
						required
					/>
				</div>
				<div className="rounded-md border bg-muted/50 px-3 py-2 text-sm">
					<p className="text-muted-foreground">
						Resulting dates:{" "}
						<span className="font-medium text-foreground">
							{previewStart} → {previewEnd}
						</span>
					</p>
				</div>
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => control.onOpenChange(false)}
					>
						Cancel
					</Button>
					<Button type="submit" disabled={!canSubmit}>
						{duplicate.isPending ? "Duplicating…" : "Duplicate"}
					</Button>
				</DialogFooter>
			</form>
		</>
	);
}

export function DuplicateProjectDialog() {
	const control = projectDuplicateDialog.useControl();

	return (
		<Dialog open={control.open} onOpenChange={control.onOpenChange}>
			<DialogContent>
				<QuerySuspenseBoundary>
					<Content />
				</QuerySuspenseBoundary>
			</DialogContent>
		</Dialog>
	);
}

// --- Tiny date helpers (pure, zero-dependency, same logic as the API) ---

const DAY_MS = 86_400_000;

/** Shifts an ISO date by whole days (UTC, no timezone drift). */
function addDays(iso: string, days: number): string {
	const date = new Date(`${iso}T00:00:00.000Z`);
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

/** Whole-day difference between two ISO dates (b - a). */
function diffDays(a: string, b: string): number {
	return Math.round(
		(Date.parse(`${b}T00:00:00.000Z`) - Date.parse(`${a}T00:00:00.000Z`)) /
			DAY_MS,
	);
}