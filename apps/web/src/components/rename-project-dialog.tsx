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
import { Textarea } from "@projection/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useTRPC } from "@/utils/trpc";

export interface RenameProjectDialogProject {
	id: string;
	name: string;
	description: string | null;
	seedStart: string;
	seedEnd: string;
}

/** Rename a Project (CONTEXT.md — Project): name and description are editable
 * here; the seed dates are shown read-only because the Timeline Window is
 * derived from the Lines. Both Owners and Editors may edit (the update
 * mutation allows both). Controlled — the caller owns `open` so the dialog
 * can outlive a dropdown menu closing. */
export default function RenameProjectDialog({
	project,
	open,
	onOpenChange,
}: {
	project: RenameProjectDialogProject;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [name, setName] = useState(project.name);
	const [description, setDescription] = useState(project.description ?? "");

	// Resync the fields from the Project each time the dialog opens, so a
	// discarded edit or a remote change never lingers in the form.
	useEffect(() => {
		if (open) {
			setName(project.name);
			setDescription(project.description ?? "");
		}
	}, [open, project.name, project.description]);

	const update = useMutation(
		trpc.projects.update.mutationOptions({
			onSuccess: async () => {
				await Promise.all([
					// The projects collection syncs off this query key (see lib/collections)
					queryClient.invalidateQueries({
						queryKey: ["collection", "projects"],
					}),
					queryClient.invalidateQueries({
						queryKey: trpc.projects.byId.queryKey({ id: project.id }),
					}),
				]);
				onOpenChange(false);
				toast.success("Project updated");
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const trimmed = name.trim();
	const dirty =
		trimmed !== project.name ||
		(description.trim() || null) !== (project.description ?? null);
	const canSubmit = trimmed.length > 0 && dirty && !update.isPending;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Edit project</DialogTitle>
					<DialogDescription>
						The Timeline Window grows to fit your Lines, so the dates below
						follow your plan.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (!canSubmit) return;
						update.mutate({
							id: project.id,
							name: trimmed,
							description: description.trim() || null,
						});
					}}
				>
					<div className="space-y-2">
						<Label htmlFor="rename-project-name">Name</Label>
						<Input
							id="rename-project-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="rename-project-description">
							Description (optional)
						</Label>
						<Textarea
							id="rename-project-description"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							rows={2}
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="rename-project-start">Start</Label>
							<Input
								id="rename-project-start"
								type="date"
								value={project.seedStart}
								disabled
								readOnly
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="rename-project-end">End</Label>
							<Input
								id="rename-project-end"
								type="date"
								value={project.seedEnd}
								disabled
								readOnly
							/>
						</div>
					</div>
					<DialogFooter>
						<Button type="submit" disabled={!canSubmit}>
							{update.isPending ? "Saving…" : "Save"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
