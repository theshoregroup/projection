import {
	ArrowsClockwiseIcon,
	CopyIcon,
	FilePdfIcon,
	TrashIcon,
} from "@phosphor-icons/react/dist/ssr";
import type { RouterOutputs } from "@projection/api/routers/index";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@projection/ui/components/avatar";
import { Button } from "@projection/ui/components/button";
import {
	Combobox,
	ComboboxContent,
	ComboboxEmpty,
	ComboboxInput,
	ComboboxItem,
	ComboboxList,
} from "@projection/ui/components/combobox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@projection/ui/components/dialog";
import {
	Empty,
	EmptyDescription,
	EmptyTitle,
} from "@projection/ui/components/empty";
import { Input } from "@projection/ui/components/input";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemTitle,
} from "@projection/ui/components/item";
import { QuerySuspenseBoundary } from "@projection/ui/components/query";
import { Switch } from "@projection/ui/components/switch";
import {
	queryOptions,
	useMutation,
	useQuery,
	useQueryClient,
	useSuspenseQueries,
} from "@tanstack/react-query";
import { cn } from "cn";
import { useState } from "react";
import { toast } from "sonner";
import z from "zod";
import { authClient } from "@/lib/auth-client";
import { defineDialog } from "@/utils/dialogs/define-dialog";
import { useTRPC, useTRPCClient } from "@/utils/trpc";

const PDF_PAGE_SIZES = ["A3", "A2", "A1", "A0"] as const;

export const projectShareDialog = defineDialog({
	schema: z.object({
		dialogKey: z.literal("project:share"),
		dialogId: z.uuid(),
	}),
});

function Content() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const control = projectShareDialog.useControl();

	const projQueryOptions = trpc.projects.byId.queryOptions({
		id: control.dialogId ?? "",
	});
	const projEditorsQueryOptions = trpc.sharing.listEditors.queryOptions({
		projectId: control.dialogId ?? "",
	});
	const membersQueryOptions = queryOptions({
		queryKey: ["members", "againstProject", control.dialogId],
		queryFn: () => {
			const { data, error } = authClient.useActiveOrganization();

			if (error) {
				throw error;
			}

			return data?.members ?? [];
		},
	});

	const { editors, project, role } = useSuspenseQueries({
		queries: [projQueryOptions, projEditorsQueryOptions],
		combine: ([projData, projEditorsData]) => {
			return {
				...projData.data,
				editors: projEditorsData.data,
			};
		},
	});
	const { data: members } = useQuery(membersQueryOptions);

	const regenerateShareTokenMutation = useMutation(
		trpc.projects.regenerateShareToken.mutationOptions({
			onMutate: () =>
				toast.loading("Regenerating share link...", {
					description: "Please wait while we regenerate the share link.",
				}),
			onSuccess: (_d, _v, toastId) => {
				toast.success("Share link regenerated!", {
					description:
						"Old links are no longer valid, please re-share the link.",
					id: toastId,
				});
			},
			onError: (_e, _v, toastId) => {
				toast.error("Failed to regenerate share link.", {
					description: "Please try again later.",
					id: toastId,
				});
			},
			onSettled: async () =>
				await queryClient.invalidateQueries(projQueryOptions),
		}),
	);

	const updateProjectMutation = useMutation(
		trpc.projects.update.mutationOptions({
			onMutate: () =>
				toast.loading("Updating project...", {
					description: "Please wait while we update the project.",
				}),

			onSuccess: (_d, _v, toastId) => {
				toast.success("Project updated!", {
					description: "",
					id: toastId,
				});
			},
			onError: (_e, _v, toastId) => {
				toast.error("Failed to regenerate share link.", {
					description: "Please try again later.",
					id: toastId,
				});
			},
			onSettled: async () =>
				await queryClient.invalidateQueries(projQueryOptions),
		}),
	);

	const shareUrl =
		project.shareToken &&
		`${window.location.origin}/share/${project.shareToken}`;

	return (
		<>
			<DialogHeader>
				<DialogTitle>Share “{project.name}”</DialogTitle>
				<DialogDescription>
					Only you and your Editors can open this project. The link below is
					read-only.
				</DialogDescription>
			</DialogHeader>

			{/* Share Link */}

			<div className="space-y-2">
				<h3 className="font-medium text-sm">Share public link</h3>
				<div className="flex gap-2">
					<Input
						readOnly
						value={shareUrl || "…"}
						onFocus={(e) => e.target.select()}
					/>
					<Button
						variant="outline"
						size="icon"
						onClick={async () => {
							if (!shareUrl) {
								toast.warning("There isn't a share link to use!");
								return;
							}
							await navigator.clipboard.writeText(shareUrl);
							toast.success("Link copied to clipboard!");
						}}
						aria-label="Copy link"
					>
						<CopyIcon className="size-4" />
					</Button>
				</div>
				{role === "owner" && (
					<Button
						disabled={regenerateShareTokenMutation.isPending}
						variant="ghost"
						size="sm"
						onClick={async () =>
							await regenerateShareTokenMutation.mutateAsync({
								id: project.id,
							})
						}
					>
						<ArrowsClockwiseIcon
							className={cn(
								"size-3",
								regenerateShareTokenMutation.isPending && "animate-spin",
							)}
						/>{" "}
						Regenerate link
					</Button>
				)}
			</div>

			{/* Editors */}
			<div className="space-y-3">
				<h3 className="font-medium text-sm">Editors</h3>

				{editors.length === 0 && (
					<Empty>
						<EmptyTitle>No Editors</EmptyTitle>
						<EmptyDescription>
							No editors have been added to this board yet. No editors means no
							friends. Do you have no friends? Add a friend.
						</EmptyDescription>
					</Empty>
				)}
				{editors.length > 0 && (
					<ItemGroup>
						{editors.map((editor) => (
							<Item key={editor.id} variant="outline">
								<ItemMedia>
									<Avatar>
										{editor.user?.image && (
											<AvatarImage
												src={editor.user.image}
												className="grayscale"
											/>
										)}
										<AvatarFallback>
											{editor.user?.name
												.split(" ")
												.map((w) => w.charAt(0))
												.join("") ?? editor.email.charAt(0)}
										</AvatarFallback>
									</Avatar>
								</ItemMedia>
								<ItemContent className="gap-1">
									<ItemTitle>{editor.user?.name ?? "Invited User"}</ItemTitle>
									<ItemDescription>
										{editor.user?.email ?? editor.email}
									</ItemDescription>
								</ItemContent>
								<ItemActions>
									<Button
										variant="destructive"
										size="icon"
										className="rounded-full"
									>
										<TrashIcon />
										<span className="sr-only">Remove Editor</span>
									</Button>
								</ItemActions>
							</Item>
						))}
					</ItemGroup>
				)}

				<Combobox
					items={members}
					itemToStringValue={(member: NonNullable<typeof members>[number]) =>
						member.user.name
					}
				>
					<ComboboxInput placeholder="Search members..." />
					<ComboboxContent>
						<ComboboxEmpty>No members found.</ComboboxEmpty>
						<ComboboxList>
							{(member) => (
								<ComboboxItem key={member.id} value={member}>
									<Item size="xs" className="p-0">
										<ItemContent>
											<ItemTitle className="whitespace-nowrap">
												{member.user.name}
											</ItemTitle>
											<ItemDescription>
												{member.user.email} ({member.role})
											</ItemDescription>
										</ItemContent>
									</Item>
								</ComboboxItem>
							)}
						</ComboboxList>
					</ComboboxContent>
				</Combobox>
			</div>

			{/* Download as a PDF */}
			<div className="space-y-3">
				<h3 className="font-medium text-sm">Share as PDF</h3>
				{role === "owner" && (
					<div className="flex items-center justify-between gap-2 text-sm">
						<span className="text-muted-foreground">
							Let visitors with the link export as PDF
						</span>
						<Switch
							checked={project.allowVisitorsToExport}
							onCheckedChange={async (checked) => {
								await updateProjectMutation.mutateAsync({
									id: project.id,
									allowVisitorsToExport: checked,
								});
							}}
							disabled={updateProjectMutation.isPending}
							aria-label="Let visitors export as PDF"
						/>
					</div>
				)}
				<DownloadPdfControls projectId={project.id} />
			</div>
		</>
	);
}

function DownloadPdfControls({ projectId }: { projectId: string }) {
	const rawTrpcClient = useTRPCClient();
	const [pageSize, setPageSize] = useState<(typeof PDF_PAGE_SIZES)[number]>(
		PDF_PAGE_SIZES[0],
	);

	function handleActualDownload(props: RouterOutputs["projects"]["exportPdf"]) {
		const { filename, data } = props;
		const blob = new Blob([data as BlobPart], {
			type: "application/pdf",
		});
		const url = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = url;
		anchor.download = filename;
		document.body.appendChild(anchor);
		anchor.click();
		anchor.remove();
	}

	const downloadPdf = useMutation({
		mutationKey: ["download-project", projectId, pageSize],
		mutationFn: async () => {
			const blobData = await rawTrpcClient.projects.exportPdf.mutate({
				id: projectId,
				pageSize,
			});

			handleActualDownload(blobData);

			return blobData;
		},
		onMutate: () =>
			toast.loading("Preparing your PDF export", {
				description: "This may take a moment, please don't leave this page",
			}),
		onError: (e, _v, toastId) =>
			toast.error(`There was an error exporting your PDF: ${e.name}`, {
				description: e.message,
				id: toastId,
			}),
		onSuccess: (res, _v, toastId) =>
			toast.success("PDF exported successfully", {
				description: "Your PDF is ready to download",
				id: toastId,
				action: {
					label: "Download again",
					onClick: () => handleActualDownload(res),
					type: "button",
				},
			}),
	});

	return (
		<div className="flex items-center justify-between gap-2">
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
				onClick={async () => await downloadPdf.mutateAsync()}
				disabled={downloadPdf.isPending}
			>
				<FilePdfIcon className="size-4" />
				{downloadPdf.isPending ? "Preparing…" : "Download PDF"}
			</Button>
		</div>
	);
}

export function ShareProjectDialog() {
	const control = projectShareDialog.useControl();

	return (
		<Dialog open={control.open} onOpenChange={control.onOpenChange}>
			<DialogContent className="overflow-y-auto">
				<QuerySuspenseBoundary>
					<Content />
				</QuerySuspenseBoundary>
			</DialogContent>
		</Dialog>
	);
}
