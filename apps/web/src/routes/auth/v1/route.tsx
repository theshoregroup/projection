import { ProjectorScreenChartIcon } from "@phosphor-icons/react";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/auth/v1")({
	component: () => (
		<div className="flex min-h-svh flex-col items-center justify-center gap-6 bg-muted p-6 md:p-10">
			<div className="flex w-full max-w-sm flex-col gap-6">
				<Link className="flex items-center gap-2 self-center" to="/">
					<div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
						<ProjectorScreenChartIcon className="size-4" />
					</div>
					<span className="font-medium">projection</span>
				</Link>
				<Outlet />
			</div>
		</div>
	),
});
