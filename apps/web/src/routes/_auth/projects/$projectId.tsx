import { ShareFatIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@projection/ui/components/button";

import { SidebarTrigger } from "@projection/ui/components/sidebar";
import { useLiveQuery } from "@tanstack/react-db";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import BoardView from "@/components/board/board-view";
import SharePanel from "@/components/board/share-panel";
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
});

function ProjectPage() {
	const { projectId } = Route.useParams();
	const trpc = useTRPC();
	const trpcClient = useTRPCClient();
	const queryClient = useQueryClient();

	const projectQuery = useQuery(
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
				<SharePanel
					project={project}
					role={role}
					trigger={
						<Button variant="outline" size="sm">
							<ShareFatIcon className="size-4" /> Share
						</Button>
					}
				/>
			</div>

			<BoardView
				project={project}
				lines={lineRows ?? []}
				linesCollection={linesCollection}
			/>
		</div>
	);
}
