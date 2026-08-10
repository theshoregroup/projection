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
import { authClient } from "@/lib/auth-client";
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
	const { data: sessionData } = authClient.useSession();
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
		<div className="container mx-auto space-y-6 p-6">
			<Card className="w-full py-10">
				<CardContent>
					<h1 className="text-center font-medium text-3xl">
						Welcome back {sessionData?.user.name.split(" ").at(0)}
					</h1>
				</CardContent>
			</Card>

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="font-semibold text-xl">My projects</h2>
					<CreateProjectDialog trigger={<Button>New project</Button>} />
				</div>
				<ProjectCards
					projects={mine ?? []}
					empty="No projects yet — create your first one."
				/>
			</div>

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
