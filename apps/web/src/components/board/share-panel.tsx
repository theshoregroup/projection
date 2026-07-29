import { Badge } from "@projection/ui/components/badge";
import { Button } from "@projection/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@projection/ui/components/dialog";
import { Input } from "@projection/ui/components/input";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import { Copy, RefreshCw, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { getEditorsCollection, type ProjectRow } from "@/lib/collections";
import { useTRPC, useTRPCClient } from "@/utils/trpc";

interface SharePanelProps {
	project: ProjectRow;
	role: "owner" | "editor";
	trigger: ReactNode;
}

export default function SharePanel({
	project,
	role,
	trigger,
}: SharePanelProps) {
	const trpc = useTRPC();
	const trpcClient = useTRPCClient();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [origin, setOrigin] = useState("");

	// window.location is client-only; set after mount for SSR safety
	useEffect(() => {
		setOrigin(window.location.origin);
	}, []);

	const editorsCollection = useMemo(
		() => getEditorsCollection(queryClient, trpcClient, project.id),
		[queryClient, trpcClient, project.id],
	);
	const { data: editors } = useLiveQuery(
		(q) =>
			q
				.from({ e: editorsCollection })
				.orderBy(({ e }) => e.createdAt, { direction: "asc" }),
		[editorsCollection],
	);

	const invalidateEditors = () =>
		queryClient.invalidateQueries({
			queryKey: ["collection", "editors", project.id],
		});
	const invalidateProject = () =>
		queryClient.invalidateQueries({
			queryKey: trpc.projects.byId.queryKey({ id: project.id }),
		});

	const shareUrl =
		project.shareToken && origin ? `${origin}/share/${project.shareToken}` : "";

	const copyLink = async () => {
		if (!shareUrl) return;
		await navigator.clipboard.writeText(shareUrl);
		toast.success("Link copied");
	};

	const regenerate = async () => {
		await trpcClient.projects.regenerateShareToken.mutate({ id: project.id });
		await invalidateProject();
		toast.success("Share link regenerated — old links no longer work");
	};

	const submitInvite = async () => {
		const trimmed = email.trim();
		if (!trimmed) return;
		try {
			const result = await trpcClient.sharing.invite.mutate({
				projectId: project.id,
				email: trimmed,
			});
			await invalidateEditors();
			toast.success(
				result.inviteSent
					? `Invite emailed to ${trimmed}`
					: `${trimmed} can now edit this project`,
			);
			setEmail("");
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn't invite that email",
			);
		}
	};

	const removeEditor = async (editorId: string) => {
		await trpcClient.sharing.removeEditor.mutate({ editorId });
		await invalidateEditors();
	};

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger render={trigger as React.ReactElement} />
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Share “{project.name}”</DialogTitle>
					<DialogDescription>
						Only you and your Editors can open this project. The link below is
						read-only.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-6">
					{/* Share Link (CONTEXT.md) */}
					<div className="space-y-2">
						<h3 className="font-medium text-sm">Share link</h3>
						<div className="flex gap-2">
							<Input
								readOnly
								value={shareUrl || "…"}
								onFocus={(e) => e.target.select()}
							/>
							<Button
								variant="outline"
								size="icon"
								onClick={copyLink}
								aria-label="Copy link"
							>
								<Copy className="size-4" />
							</Button>
						</div>
						{role === "owner" && (
							<Button variant="ghost" size="sm" onClick={regenerate}>
								<RefreshCw className="size-3" /> Regenerate link
							</Button>
						)}
					</div>

					{/* Editors (CONTEXT.md) */}
					<div className="space-y-3">
						<h3 className="font-medium text-sm">Editors</h3>
						{(editors ?? []).length === 0 ? (
							<p className="text-muted-foreground text-sm">No editors yet.</p>
						) : (
							<ul className="space-y-2">
								{(editors ?? []).map((editor) => (
									<li
										key={editor.id}
										className="flex items-center gap-2 text-sm"
									>
										<span className="flex-1 truncate">{editor.email}</span>
										<Badge
											variant={
												editor.status === "active" ? "default" : "secondary"
											}
										>
											{editor.status === "active" ? "Editor" : "Invited"}
										</Badge>
										{role === "owner" && (
											<Button
												variant="ghost"
												size="icon"
												onClick={() => void removeEditor(editor.id)}
												aria-label={`Remove ${editor.email}`}
											>
												<Trash2 className="size-4" />
											</Button>
										)}
									</li>
								))}
							</ul>
						)}
						{role === "owner" && (
							<form
								className="flex gap-2"
								onSubmit={(event) => {
									event.preventDefault();
									void submitInvite();
								}}
							>
								<Input
									type="email"
									placeholder="colleague@yourco.com"
									value={email}
									onChange={(event) => setEmail(event.target.value)}
									required
								/>
								<Button type="submit" variant="secondary">
									Invite
								</Button>
							</form>
						)}
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
