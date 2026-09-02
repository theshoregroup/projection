import { BeachBallIcon, PlusCircleIcon, SignOutIcon } from "@phosphor-icons/react/dist/ssr";
import { Alert, AlertDescription, AlertTitle } from "@projection/ui/components/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@projection/ui/components/avatar";
import { Badge } from "@projection/ui/components/badge";
import { Button } from "@projection/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@projection/ui/components/card";
import {
	Item,
	ItemActions,
	ItemContent,
	ItemDescription,
	ItemGroup,
	ItemMedia,
	ItemSeparator,
	ItemTitle,
} from "@projection/ui/components/item";
import { queryOptions, useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CreateNewOrganizationDialog } from "@/components/organization/create.dialog";
import { authClient } from "@/lib/auth-client";
import { getSsrHeaders } from "@/lib/auth-headers";
import { getOrgShortName } from "@/utils/auth";

const orgsQry = queryOptions({
	queryKey: ["list-orgs"],
	queryFn: async () => {
		const { data, error } = await authClient.organization.list({
			fetchOptions: {
				headers: getSsrHeaders(),
			},
		});

		if (error) {
			throw error;
		}

		return data;
	},
});

const invitationsQry = queryOptions({
	queryKey: ["list-invitations"],
	queryFn: async () => {
		const { data, error } = await authClient.organization.listUserInvitations({
			fetchOptions: {
				headers: getSsrHeaders(),
			},
		});

		if (error) {
			throw error;
		}

		return data;
	},
});

export const Route = createFileRoute("/auth/v1/organizations")({
	beforeLoad: async ({ context }) => {
		if (!context.session) {
			throw redirect({
				to: "/auth/v1/sign-in",
			});
		}
	},
	loader: async ({ context }) =>
		await Promise.all([
			context.queryClient.ensureQueryData(orgsQry),
			context.queryClient.ensureQueryData(invitationsQry),
		]),
	component: RouteComponent,
});

function RouteComponent() {
	const navigate = useNavigate();
	const organizationsQuery = useQuery(orgsQry);
	const invitationsQuery = useQuery(invitationsQry);
	const { session } = Route.useRouteContext({
		select: ({ session }) => ({ session }),
	});

	const [error, setError] = useState<string | null>(null);

	const handleAccept = useMutation({
		mutationKey: ["accept_invite"],
		mutationFn: async (invitationId: string) => {
			const { data, error } = await authClient.organization.acceptInvitation({ invitationId });
			if (error) {
				throw error;
			}
			return data;
		},
		onMutate: (invitationId) => {
			setError(null);

			toast.loading("Accepting your invitation", {
				id: `accept_invite_${invitationId}`,
				description: "",
			});
		},

		onSuccess: async (data, invitationId) => {
			toast.success("Invitation accepted", {
				id: `accept_invite_${invitationId}`,
				description: "You have successfully accepted the invitation.",
			});

			const { data: activeOrg } = await authClient.organization.setActive({
				organizationId: data.member.organizationId,
			});

			if (!activeOrg) {
				// Failed to set, this may be a caching issue?
				throw redirect({
					to: "/auth/v1/organizations",
				});
			}

			throw redirect({
				to: "/dashboard",
			});
		},

		onError: (error, invitationId) => {
			setError(error.message);

			toast.error("Failed to accept invitation", {
				id: `accept_invite_${invitationId}`,
				description: error.message,
			});
		},
	});

	return (
		<Card>
			<CardHeader>
				<CardTitle>Select an Organization</CardTitle>
				<CardDescription>Select an organization to continue</CardDescription>
			</CardHeader>

			<CardContent>
				<ItemGroup>
					<CreateNewOrganizationDialog
						triggerButton={
							<Item aria-orientation="horizontal">
								<ItemMedia className="bg-accent text-accent-foreground p-2 rounded-sm" variant={"icon"}>
									<PlusCircleIcon />
								</ItemMedia>

								<ItemContent>
									<ItemTitle>Create A New Organization</ItemTitle>

								</ItemContent>
							</Item>
						}
					/>

					{organizationsQuery.isLoading && (
						<Item aria-orientation="horizontal" variant={"muted"}>
							<ItemContent>
								<ItemTitle>Loading organizations...</ItemTitle>
								<ItemDescription>Fetching organizations you belong to.</ItemDescription>
							</ItemContent>
						</Item>
					)}
					{organizationsQuery.data?.map((organization) => (
						<Item
							aria-orientation="horizontal"
							className="hover:cursor-pointer"
							key={`organization-item-${organization.id}`}
							render={
								<button
									onClick={async () => {
										const id = toast.loading(`Switching to ${organization.name}...`);

										if (session?.activeOrganizationId === organization.id) {
											toast.success("Redirecting you to your dashboard...", {
												id,
											});
											navigate({ to: "/dashboard" });
											return;
										}

										await authClient.organization.setActive({
											organizationId: organization.id,
											fetchOptions: {
												onSuccess: () => {
													toast.success(`Switched to ${organization.name}`, { id });
													navigate({ to: "/dashboard" });
												},
											},
										});
									}}
									type="button"
								/>
							}
							variant={session?.activeOrganizationId === organization.id ? "muted" : "default"}
						>
							<ItemMedia>
								<Avatar className="rounded-sm after:rounded-sm">
									<AvatarFallback className="rounded-sm">{getOrgShortName(organization.name)}</AvatarFallback>
									{organization.logo && (
										<AvatarImage className="rounded-sm" src={organization.logo} alt={organization.name} />
									)}
								</Avatar>
							</ItemMedia>
							<ItemContent>
								<ItemTitle>{organization.name}</ItemTitle>
								<ItemDescription>{organization.slug}</ItemDescription>
							</ItemContent>
							{session?.activeOrganizationId === organization.id && <Badge>Active</Badge>}
						</Item>
					))}
					{!organizationsQuery.isLoading && organizationsQuery.data?.length === 0 && (
						<Item aria-orientation="horizontal" variant={"muted"}>
							<ItemContent>
								<ItemTitle>No organizations yet</ItemTitle>
							</ItemContent>
						</Item>
					)}

					{invitationsQuery.data?.map((invite) => {
						return (
							<Item key={invite.id} aria-orientation="horizontal" variant={"outline"}>
								<ItemContent>
									<ItemTitle>{invite.organizationName}</ItemTitle>
									<div className="flex flex-row gap-2">
										<Badge>Invited</Badge>
										<ItemDescription>{invite.role}</ItemDescription>
									</div>
								</ItemContent>
								<ItemActions>
									<Button disabled={handleAccept.isPending} onClick={() => handleAccept.mutate(invite.id)}>
										Accept {handleAccept.isPending && <BeachBallIcon className="animate animate-spin ease-in-out" />}
									</Button>
								</ItemActions>
							</Item>
						);
					})}

					{error && (
						<Alert variant="destructive">
							<AlertTitle>There was an error processing your request</AlertTitle>
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<ItemSeparator />

					<Item
						aria-orientation="horizontal"
						className="hover:cursor-pointer"
						render={
							<button
								onClick={async () => {
									const id = toast.loading("Signing out...");
									await authClient.signOut();
									toast.success("Signed out successfully", { id });

									navigate({ to: "/auth/v1/sign-in" });
								}}
								type="button"
							/>
						}
					>
						<ItemMedia className="p-2 bg-destructive text-destructive-foreground rounded-sm" variant={"icon"}>
							<SignOutIcon />
						</ItemMedia>

						<ItemContent>
							<ItemTitle>Sign Out</ItemTitle>
							<ItemDescription>Sign out of your account</ItemDescription>
						</ItemContent>
					</Item>
				</ItemGroup>
			</CardContent>
		</Card>
	);
}
