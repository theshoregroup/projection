import {
	ArrowsClockwiseIcon,
	CopyIcon,
	FilePdfIcon,
	TrashIcon,
} from "@phosphor-icons/react/dist/ssr";
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
import { Switch } from "@projection/ui/components/switch";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getEditorsCollection, type ProjectRow } from "@/lib/collections";
import { useTRPC, useTRPCClient } from "@/utils/trpc";

const PDF_PAGE_SIZES = ["A3", "A2", "A1", "A0"] as const;
type PdfPageSize = (typeof PDF_PAGE_SIZES)[number];

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
	const [pageSize, setPageSize] = useState<PdfPageSize>("A3");
	const [downloading, setDownloading] = useState(false);
	const [togglingExport, setTogglingExport] = useState(false);

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

	const toggleVisitorsExport = async (allow: boolean) => {
		setTogglingExport(true);
		try {
			await trpcClient.projects.update.mutate({
				id: project.id,
				allowVisitorsToExport: allow,
			});
			await invalidateProject();
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn't update that setting",
			);
		} finally {
			setTogglingExport(false);
		}
	};

	const downloadPdf = async () => {
		setDownloading(true);
		try {
			const result = await trpcClient.projects.exportPdf.mutate({
				id: project.id,
				pageSize,
			});
			const blob = new Blob([result.data as BlobPart], {
				type: "application/pdf",
			});
			const url = URL.createObjectURL(blob);
			const anchor = document.createElement("a");
			anchor.href = url;
			anchor.download = result.filename;
			document.body.appendChild(anchor);
			anchor.click();
			anchor.remove();
			URL.revokeObjectURL(url);
		} catch (error) {
			toast.error(
				error instanceof Error ? error.message : "Couldn't export the PDF",
			);
		} finally {
			setDownloading(false);
		}
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
								<CopyIcon className="size-4" />
							</Button>
						</div>
						{role === "owner" && (
							<Button variant="ghost" size="sm" onClick={regenerate}>
								<ArrowsClockwiseIcon className="size-3" /> Regenerate link
							</Button>
						)}
					</div>

					{/* Share as PDF */}
					<div className="space-y-3">
						<h3 className="font-medium text-sm">Share as PDF</h3>
						{role === "owner" && (
							<div className="flex items-center justify-between gap-2 text-sm">
								<span className="text-muted-foreground">
									Let visitors with the link export as PDF
								</span>
								<Switch
									checked={project.allowVisitorsToExport}
									onCheckedChange={(checked) =>
										void toggleVisitorsExport(checked)
									}
									disabled={togglingExport}
									aria-label="Let visitors export as PDF"
								/>
							</div>
						)}
						<div className="flex items-center gap-2">
							<div className="flex overflow-hidden rounded-md border">
								{PDF_PAGE_SIZES.map((size) => (
									<button
										key={size}
										type="button"
										onClick={() => setPageSize(size)}
										className={`px-2 py-1 text-xs ${
											pageSize === size
												? "bg-primary text-primary-foreground"
												: "bg-background hover:bg-muted"
										}`}
										aria-pressed={pageSize === size}
									>
										{size}
									</button>
								))}
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={() => void downloadPdf()}
								disabled={downloading}
							>
								<FilePdfIcon className="size-4" />
								{downloading ? "Preparing…" : "Download PDF"}
							</Button>
						</div>
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
												<TrashIcon className="size-4" />
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
