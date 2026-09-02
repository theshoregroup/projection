import {
	BeachBallIcon,
	GearSixIcon,
	ShieldStarIcon,
	SignOutIcon,
	UserSwitchIcon,
} from "@phosphor-icons/react/dist/ssr";
import { checkRoleForSuperuser } from "@projection/auth/organization/permissions";
import {
	Avatar,
	AvatarBadge,
	AvatarFallback,
	AvatarImage,
} from "@projection/ui/components/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@projection/ui/components/dropdown-menu";
import {
	SidebarMenuButton,
	SidebarMenuItem,
} from "@projection/ui/components/sidebar";
import { Skeleton } from "@projection/ui/components/skeleton";
import { Link } from "@tanstack/react-router";
import { authClient, useSignOut } from "@/lib/auth-client";

/**
 * Sidebar footer: avatar + name, with org switch / org settings /
 * user management / sign-out (openrms user-menu, minus teams + PostHog).
 */
export function UserMenu() {
	const { data: sessionData, isPending: isSessionPending } =
		authClient.useSession();
	const { data: activeOrganization } = authClient.useActiveOrganization();
	const { data: activeMember } = authClient.useActiveMemberRole();

	const { signOut, isPending: isSigningOut } = useSignOut();

	if (isSessionPending) {
		return (
			<SidebarMenuItem>
				<SidebarMenuButton disabled>
					<Skeleton />
				</SidebarMenuButton>
			</SidebarMenuItem>
		);
	}

	if (!sessionData) {
		console.error("Failed to load session information");
		return null;
	}

	const { user } = sessionData;
	const isInstanceAdmin = user.role === "admin";
	const hasActiveOrg =
		Boolean(sessionData.session.activeOrganizationId) &&
		Boolean(activeOrganization);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger render={<SidebarMenuButton />}>
				<Avatar>
					{user.image && <AvatarImage src={user.image} />}
					<AvatarFallback>{getFallbackText(user)}</AvatarFallback>
					{isInstanceAdmin && (
						<AvatarBadge>
							<ShieldStarIcon />
						</AvatarBadge>
					)}
				</Avatar>
				<div className="overflow-auto">
					<div className="font-medium text-sm">{user.name}</div>
					<div className="truncate text-[0.7rem] text-muted-foreground">
						{user.email}
					</div>
				</div>
			</DropdownMenuTrigger>

			<DropdownMenuContent align="start" sideOffset={10}>
				{hasActiveOrg && activeOrganization && (
					<DropdownMenuGroup>
						<DropdownMenuLabel>{activeOrganization.name}</DropdownMenuLabel>
						<DropdownMenuItem
							render={<Link to="/auth/v1/organizations" preload={false} />}
						>
							<UserSwitchIcon /> Switch Organization
						</DropdownMenuItem>

						{checkRoleForSuperuser(activeMember?.role) && (
							<DropdownMenuItem
								render={<Link to="/settings" preload={false} />}
							>
								<GearSixIcon /> Organization Settings
							</DropdownMenuItem>
						)}
					</DropdownMenuGroup>
				)}

				{(hasActiveOrg || isInstanceAdmin) && <DropdownMenuSeparator />}

				{isInstanceAdmin && (
					<DropdownMenuItem render={<Link to="/admin" preload={false} />}>
						<ShieldStarIcon /> User Management
					</DropdownMenuItem>
				)}

				<DropdownMenuItem
					variant="destructive"
					disabled={isSigningOut}
					onClick={() => signOut()}
				>
					{isSigningOut ? (
						<>
							<BeachBallIcon className="animate animate-spin ease-in-out" />{" "}
							Signing Out...
						</>
					) : (
						<>
							<SignOutIcon /> Sign Out
						</>
					)}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

const getFallbackText = (user: { name: string; email: string }) => {
	if (user.name.length > 1) {
		return user.name
			.split(" ")
			.map((v) => v.charAt(0))
			.join("");
	}

	return user.email.slice(0, 2);
};
