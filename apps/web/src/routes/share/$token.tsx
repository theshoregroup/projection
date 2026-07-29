import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import BoardView from "@/components/board/board-view";
import { useTRPC } from "@/utils/trpc";

export const Route = createFileRoute("/share/$token")({
	component: SharePage,
});

/** Public read-only Board via a Share Link (CONTEXT.md) — no sign-in required. */
function SharePage() {
	const { token } = Route.useParams();
	const trpc = useTRPC();
	const shared = useQuery(trpc.share.getByToken.queryOptions({ token }));

	if (shared.isPending) {
		return <div className="p-6 text-muted-foreground">Loading…</div>;
	}
	if (shared.isError) {
		return (
			<div className="p-6 text-destructive">
				This share link is no longer valid.
			</div>
		);
	}

	const { project, lines } = shared.data;

	return (
		<div className="flex flex-col gap-2 p-6">
			<div>
				<p className="text-muted-foreground text-xs uppercase tracking-wide">
					Shared board — read only
				</p>
				<h1 className="font-semibold text-2xl">{project.name}</h1>
				{project.description ? (
					<p className="text-muted-foreground text-sm">{project.description}</p>
				) : null}
			</div>
			<BoardView project={project} lines={lines} readOnly />
		</div>
	);
}
