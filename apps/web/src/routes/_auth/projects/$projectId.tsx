import { PencilIcon, ShareFatIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@projection/ui/components/button";

import { SidebarTrigger } from "@projection/ui/components/sidebar";
import { Skeleton } from "@projection/ui/components/skeleton";
import { useLiveQuery } from "@tanstack/react-db";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import BoardView from "@/components/board/board-view";
import SelectionActions from "@/components/board/selection-actions";
import SharePanel from "@/components/board/share-panel";
import RenameProjectDialog from "@/components/rename-project-dialog";
import { NotFoundComponent } from "@/components/ui/not-found";
import { getLinesCollection } from "@/lib/collections";
import { useTRPC, useTRPCClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/projects/$projectId")({
	component: ProjectPage,
	loader: async ({ params, context }) =>
		await context.queryClient.ensureQueryData(
			context.trpc.projects.byId.queryOptions({ id: params.projectId }),
		),
	notFoundComponent: (props) => {
		return (
			<div className="grid h-full w-full place-items-center bg-muted p-6">
				<NotFoundComponent {...props} />
			</div>
		);
	},
	pendingComponent: () => <PendingPageComponent />,
});

// Props spread onto the Button so the Share dialog's trigger (base-ui
// `render`) can attach its handlers — swallowing them breaks opening.
function ShareButton(props: React.ComponentProps<typeof Button>) {
	return (
		<Button size="sm" {...props}>
			<ShareFatIcon className="size-4" /> Share
		</Button>
	);
}

function PendingPageComponent() {
	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-start justify-between gap-4 p-4">
				<div className="space-y-2">
					<SidebarTrigger />
					<Skeleton className="h-8 w-80 max-w-80" />
					<Skeleton className="h-4 w-96 max-w-96" />
				</div>
				<ShareButton />
			</div>
		</div>
	);
}

function ProjectPage() {
	const { projectId } = Route.useParams();
	const trpc = useTRPC();
	const trpcClient = useTRPCClient();
	const queryClient = useQueryClient();

	const projectQuery = useSuspenseQuery(
		trpc.projects.byId.queryOptions(
			{ id: projectId },
			{
				throwOnError: true,
			},
		),
	);

	const linesCollection = useMemo(
		() => getLinesCollection(queryClient, trpcClient, projectId),
		[queryClient, trpcClient, projectId],
	);
	const { data: lineRows, isLoading: linesLoading } = useLiveQuery(
		(q) =>
			q
				.from({ l: linesCollection })
				.orderBy(({ l }) => l.sortOrder, { direction: "asc" }),
		[linesCollection],
	);

	// Row selection for the bulk actions (Copy / Delete / Group) in the
	// header. renameItemId asks the Board to open a just-created Group's
	// title for naming.
	const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(
		new Set(),
	);
	const [renameItemId, setRenameItemId] = useState<string | null>(null);
	const [editProjectOpen, setEditProjectOpen] = useState(false);

	function toggleSelected(lineId: string, checked: boolean) {
		setSelectedIds((prev) => {
			const next = new Set(prev);
			if (checked) next.add(lineId);
			else next.delete(lineId);
			return next;
		});
	}

	if (projectQuery.isPending || linesLoading) {
		return <div className="p-6 text-muted-foreground">Loading board…</div>;
	}
	if (projectQuery.isError) {
		return (
			<div className="p-6 text-destructive">{projectQuery.error.message}</div>
		);
	}

	const { project, role } = projectQuery.data;

	return (
		<div className="flex flex-col gap-2">
			<div className="flex items-start justify-between gap-4 p-4">
				<div>
					<SidebarTrigger />
					<h1 className="font-semibold text-2xl">{project.name}</h1>
					{project.description ? (
						<p className="text-muted-foreground text-sm">
							{project.description}
						</p>
					) : null}
				</div>
				<div className="flex items-center gap-2">
					{/* Owners and Editors may both rename (CONTEXT.md — Editor) */}
					<Button
						size="sm"
						variant="outline"
						onClick={() => setEditProjectOpen(true)}
					>
						<PencilIcon className="size-4" /> Edit
					</Button>
					<RenameProjectDialog
						project={project}
						open={editProjectOpen}
						onOpenChange={setEditProjectOpen}
					/>
					<SelectionActions
						projectId={project.id}
						selectedIds={selectedIds}
						onClear={() => setSelectedIds(new Set())}
						onGrouped={setRenameItemId}
					/>
					<SharePanel project={project} role={role} trigger={<ShareButton />} />
				</div>
			</div>

			<BoardView
				project={project}
				lines={lineRows ?? []}
				linesCollection={linesCollection}
				selectedIds={selectedIds}
				onToggleSelected={toggleSelected}
				renameItemId={renameItemId}
			/>
		</div>
	);
}
