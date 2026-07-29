import { Button } from "@projection/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@projection/ui/components/dialog";
import { Input } from "@projection/ui/components/input";
import { Label } from "@projection/ui/components/label";
import { Textarea } from "@projection/ui/components/textarea";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import { useTRPC } from "@/utils/trpc";

function isoToday(): string {
	return new Date().toISOString().slice(0, 10);
}

function isoPlusDays(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return date.toISOString().slice(0, 10);
}

export default function CreateProjectDialog({
	trigger,
}: {
	trigger: ReactNode;
}) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [seedStart, setSeedStart] = useState(isoToday());
	const [seedEnd, setSeedEnd] = useState(isoPlusDays(90));

	const create = useMutation(
		trpc.projects.create.mutationOptions({
			onSuccess: async (created) => {
				// The projects collection syncs off this query key (see lib/collections)
				await queryClient.invalidateQueries({
					queryKey: ["collection", "projects"],
				});
				setOpen(false);
				navigate({
					to: "/projects/$projectId",
					params: { projectId: created.id },
				});
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const canSubmit =
		name.trim().length > 0 && seedStart <= seedEnd && !create.isPending;

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={trigger as React.ReactElement} />
			<DialogContent>
				<DialogHeader>
					<DialogTitle>New project</DialogTitle>
					<DialogDescription>
						The Timeline Window starts from these dates and grows to fit your
						Lines.
					</DialogDescription>
				</DialogHeader>
				<form
					className="space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						if (!canSubmit) return;
						create.mutate({
							name: name.trim(),
							description: description.trim() || undefined,
							seedStart,
							seedEnd,
						});
					}}
				>
					<div className="space-y-2">
						<Label htmlFor="project-name">Name</Label>
						<Input
							id="project-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder="Website relaunch"
							required
						/>
					</div>
					<div className="space-y-2">
						<Label htmlFor="project-description">Description (optional)</Label>
						<Textarea
							id="project-description"
							value={description}
							onChange={(event) => setDescription(event.target.value)}
							rows={2}
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="project-start">Start</Label>
							<Input
								id="project-start"
								type="date"
								value={seedStart}
								onChange={(event) => setSeedStart(event.target.value)}
								required
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="project-end">End</Label>
							<Input
								id="project-end"
								type="date"
								value={seedEnd}
								onChange={(event) => setSeedEnd(event.target.value)}
								required
							/>
						</div>
					</div>
					{seedStart > seedEnd ? (
						<p className="text-destructive text-sm">
							End must be on or after Start.
						</p>
					) : null}
					<DialogFooter>
						<Button type="submit" disabled={!canSubmit}>
							{create.isPending ? "Creating…" : "Create project"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
