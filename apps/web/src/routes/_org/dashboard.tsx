import { Button } from "@projection/ui/components/button";
import { Card, CardContent } from "@projection/ui/components/card";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

import CreateProjectDialog from "@/components/create-project-dialog";
import ProjectsTable from "@/components/projects-table";
import { authClient } from "@/lib/auth-client";
import { getProjectsCollection } from "@/lib/collections";
import { useTRPCClient } from "@/utils/trpc";

export const Route = createFileRoute("/_org/dashboard")({
	component: Dashboard,
});

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
				<ProjectsTable
					variant="mine"
					projects={mine ?? []}
					empty="No projects yet — create your first one."
				/>
			</div>

			<div className="space-y-4">
				<h2 className="font-semibold text-xl">Shared with me</h2>
				<ProjectsTable
					variant="shared"
					projects={shared ?? []}
					empty="Nothing shared with you yet."
				/>
			</div>
		</div>
	);
}
