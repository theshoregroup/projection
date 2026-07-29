import {
	PlusIcon,
	ProjectorScreenChartIcon,
	ShieldStarIcon,
	SignOutIcon,
} from "@phosphor-icons/react/dist/ssr";
import {
	Avatar,
	AvatarBadge,
	AvatarFallback,
	AvatarImage,
} from "@projection/ui/components/avatar";
import { Button } from "@projection/ui/components/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@projection/ui/components/dropdown-menu";
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
import { Skeleton } from "@projection/ui/components/skeleton";
import { eq, useLiveQuery } from "@tanstack/react-db";
import { useQueryClient } from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import { useMemo } from "react";
import CreateProjectDialog from "@/components/create-project-dialog";
import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";
import { getProjectsCollection } from "@/lib/collections";
import { useTRPCClient } from "@/utils/trpc";

export const Route = createFileRoute("/_auth")({
	component: AuthLayout,
	beforeLoad: async () => {
		const session = await getUser();
		if (!session) {
			throw redirect({
				to: "/login",
			});
		}
		return { session };
	},
	loader: async ({ context }) => {
		if (!context.session) {
			throw redirect({
				to: "/login",
			});
		}
	},
});

function AuthLayout() {
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
		<SidebarProvider>
			<Sidebar>
				<SidebarHeader>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton
								className="font-medium text-lg"
								render={<Link to="/" preload={false} />}
							>
								Projection
							</SidebarMenuButton>
						</SidebarMenuItem>
					</SidebarMenu>
				</SidebarHeader>
				<SidebarContent>
					<SidebarMenu>
						<SidebarMenuItem>
							<SidebarMenuButton>
								<ProjectorScreenChartIcon />
								<span>My Projects</span>
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
					</SidebarMenu>
				</SidebarContent>
				<SidebarFooter>
					<SidebarMenu>
						<UserButton />
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

function UserButton() {
	const sessionQry = authClient.useSession();
	const navigate = useNavigate();

	if (sessionQry.isPending) {
		return (
			<SidebarMenuItem>
				<SidebarMenuButton disabled>
					<Skeleton />
				</SidebarMenuButton>
			</SidebarMenuItem>
		);
	}

	if (!sessionQry.data) {
		console.error("Failed to load session information");

		return null;
	}

	const { user } = sessionQry.data;

	const isSuperuser = user.role === "admin";

	return (
		<DropdownMenu>
			<SidebarMenuItem>
				<DropdownMenuTrigger render={<SidebarMenuButton />}>
					<Avatar>
						{user.image && <AvatarImage src={user.image} />}
						<AvatarFallback>
							{user.name
								.split(" ")
								.map((v) => v.charAt(0))
								.join("")}
						</AvatarFallback>
						{isSuperuser && (
							<AvatarBadge>
								<ShieldStarIcon />
							</AvatarBadge>
						)}
					</Avatar>
					<div>
						<div className="font-medium">{user.name}</div>
						<div className="text-muted-foreground text-xs">{user.email}</div>
					</div>
				</DropdownMenuTrigger>
			</SidebarMenuItem>

			<DropdownMenuContent>
				{isSuperuser && (
					<DropdownMenuItem render={<Link to={"/admin"} preload={false} />}>
						<ShieldStarIcon /> User Management
					</DropdownMenuItem>
				)}
				<DropdownMenuItem
					variant="destructive"
					onClick={() =>
						authClient.signOut({
							fetchOptions: {
								onSuccess: () => {
									navigate({
										to: "/",
									});
								},
							},
						})
					}
				>
					<SignOutIcon /> Sign Out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
