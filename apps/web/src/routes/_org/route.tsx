import {
	GearSixIcon,
	PlusIcon,
	ProjectorScreenChartIcon,
} from "@phosphor-icons/react/dist/ssr";
import { checkRoleForSuperuser } from "@projection/auth/organization/permissions";
import { Avatar, AvatarFallback } from "@projection/ui/components/avatar";
import { Button } from "@projection/ui/components/button";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarRail,
} from "@projection/ui/components/sidebar";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { useMemo } from "react";
import CreateProjectDialog from "@/components/create-project-dialog";
import { UserMenu } from "@/components/navigation/user-menu";
import { authClient } from "@/lib/auth-client";
import { getSsrHeaders } from "@/lib/auth-headers";
import { getProjectsCollection } from "@/lib/collections";
import { getOrgShortName } from "@/utils/auth";
import { useTRPCClient } from "@/utils/trpc";

export const Route = createFileRoute("/_org")({
	beforeLoad: async ({ context, location }) => {
		const { session, user } = context;

		if (!session || !user) {
			throw redirect({
				to: "/auth/v1/sign-in",
				search: { redirect: location.pathname + location.search },
			});
		}

		let activeOrganizationId = session.activeOrganizationId ?? undefined;

		// Board-link auto-switch (spec v3): when headed to a project and the
		// session is in the wrong organization (or none), try switching to
		// the Project's org. Membership is verified by better-auth; if the
		// switch fails the picker below is the fallback.
		const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
		if (projectMatch && projectMatch[1]) {
			let projectOrganizationId: string | null | undefined;
			try {
				const result = await context.queryClient.ensureQueryData(
					context.trpc.projects.byId.queryOptions({
						id: projectMatch[1],
					}),
				);
				projectOrganizationId = result.project.organizationId ?? null;
			} catch {
				// Project missing/inaccessible — the child route renders its
				// own not-found state; treat as "no org to switch to" here.
			}

			if (
				projectOrganizationId &&
				projectOrganizationId !== activeOrganizationId
			) {
				const { data, error } = await authClient.organization.setActive({
					organizationId: projectOrganizationId,
					fetchOptions: { headers: getSsrHeaders() },
				});
				if (!error && data) {
					activeOrganizationId = data.id;
				}
			}
		}

		if (!activeOrganizationId) {
			throw redirect({
				to: "/auth/v1/organizations",
				search: { redirect: location.pathname + location.search },
			});
		}

		return {
			session: {
				...session,
				activeOrganizationId: activeOrganizationId,
			},
			user,
		};
	},
	component: OrgLayout,
});

function OrgLayout() {
	const queryClient = useQueryClient();
	const trpcClient = useTRPCClient();
	const projects = useMemo(
		() => getProjectsCollection(queryClient, trpcClient),
		[queryClient, trpcClient],
	);
	const { data: activeOrganization } = authClient.useActiveOrganization();
	const { data: activeMember } = authClient.useActiveMemberRole();
	const isOrgSuperuser = checkRoleForSuperuser(activeMember?.role);

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
		<SidebarProvider>
			<Sidebar>
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								className="font-medium text-lg"
								render={<Link to="/dashboard" preload={false} />}
								size={"lg"}
							>
								<Avatar className="rounded-sm after:rounded-sm after:border-primary-foreground">
									<AvatarFallback className="rounded-sm bg-primary text-primary-foreground">
										{activeOrganization ? (
											getOrgShortName(activeOrganization.name)
										) : (
											<ProjectorScreenChartIcon />
										)}
									</AvatarFallback>
								</Avatar>
								<span className="flex flex-col">
									Projection
									{activeOrganization && (
										<span className="font-normal text-muted-foreground text-xs">
											{activeOrganization.name}
										</span>
									)}
								</span>
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarHeader>
				<SidebarContent>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								render={<Link to="/dashboard" preload={false} />}
							>
								<ProjectorScreenChartIcon />
								<span>Dashboard</span>
							</SidebarMenuButton>

							<CreateProjectDialog
								trigger={
									<SidebarMenuAction
										className="size-6"
										render={<Button size={"icon"} variant={"secondary"} />}
									>
										<PlusIcon className="size-4" />{" "}
										<span className="sr-only">Add Project</span>
									</SidebarMenuAction>
								}
							/>
						</SidebarMenuItem>
						<SidebarMenuSub>
							{mine.map((p) => (
								<SidebarMenuSubItem key={p.id}>
									<SidebarMenuSubButton
										render={
											<Link
												to={"/projects/$projectId"}
												params={{ projectId: p.id }}
												preload={false}
											/>
										}
									>
										{p.name}
									</SidebarMenuSubButton>
								</SidebarMenuSubItem>
							))}
						</SidebarMenuSub>

						{shared.length > 0 && (
							<SidebarMenuSub>
								{shared.map((p) => (
									<SidebarMenuSubItem key={p.id}>
										<SidebarMenuSubButton
											render={
												<Link
													to={"/projects/$projectId"}
													params={{ projectId: p.id }}
													preload={false}
												/>
											}
										>
											{p.name}
										</SidebarMenuSubButton>
									</SidebarMenuSubItem>
								))}
							</SidebarMenuSub>
						)}

						{isOrgSuperuser && (
							<SidebarMenuItem>
								<SidebarMenuButton
									render={<Link to="/settings" preload={false} />}
								>
									<GearSixIcon />
									<span>Settings</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						)}
					</SidebarMenu>
				</SidebarContent>
				<SidebarFooter>
					<SidebarMenu>
						<UserMenu />
					</SidebarMenu>
				</SidebarFooter>

				<SidebarRail />
			</Sidebar>

			<main className="relative w-full">
				<Outlet />
			</main>
		</SidebarProvider>
	);
}
