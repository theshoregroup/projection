import { Button } from "@projection/ui/components/button";
import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@projection/ui/components/card";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";

import CreateProjectDialog from "@/components/create-project-dialog";
import { getProjectsCollection, type ProjectsRow } from "@/lib/collections";
import { useTRPCClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth/")({
	component: Dashboard,
});

function ProjectCards({
	projects,
	empty,
}: {
	projects: ProjectsRow[];
	empty: string;
}) {
	if (projects.length === 0) {
		return <p className="text-muted-foreground text-sm">{empty}</p>;
	}
	return (
		<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{projects.map((proj) => (
				<Link
					key={proj.id}
					to="/projects/$projectId"
					params={{ projectId: proj.id }}
				>
					<Card className="h-full transition-colors hover:border-foreground/40">
						<CardHeader>
							<CardTitle>{proj.name}</CardTitle>
						</CardHeader>
						<CardContent className="space-y-1 text-muted-foreground text-sm">
							{proj.description ? (
								<p className="line-clamp-2">{proj.description}</p>
							) : null}
							<p>
								{proj.seedStart} → {proj.seedEnd}
							</p>
						</CardContent>
					</Card>
				</Link>
			))}
		</div>
	);
}

function Dashboard() {
	const queryClient = useQueryClient();
	const trpcClient = useTRPCClient();
	const projects = useMemo(
		() => getProjectsCollection(queryClient, trpcClient),
		[queryClient, trpcClient],
	);

	const { data: mine } = useLiveQuery(
		(q) =>
			q
				.from({ p: projects })
				.where(({ p }) => eq(p.relation, "mine"))
				.orderBy(({ p }) => p.updatedAt, { direction: "desc" }),
		[projects],
	);
	const { data: shared } = useLiveQuery(
		(q) =>
			q
				.from({ p: projects })
				.where(({ p }) => eq(p.relation, "shared"))
				.orderBy(({ p }) => p.name, { direction: "asc" }),
		[projects],
	);

	return (
		<div className="mx-auto w-full max-w-6xl space-y-10 p-6">
			<div className="flex items-center justify-between">
				<h1 className="font-semibold text-2xl">My projects</h1>
				<CreateProjectDialog trigger={<Button>New project</Button>} />
			</div>
			<ProjectCards
				projects={mine ?? []}
				empty="No projects yet — create your first one."
			/>

			<div className="space-y-4">
				<h2 className="font-semibold text-xl">Shared with me</h2>
				<ProjectCards
					projects={shared ?? []}
					empty="Nothing shared with you yet."
				/>
			</div>
		</div>
	);
}
