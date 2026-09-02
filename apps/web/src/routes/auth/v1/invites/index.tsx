import { BeachBallIcon } from "@phosphor-icons/react/dist/ssr";
import {
	Alert,
	AlertDescription,
	AlertTitle,
} from "@projection/ui/components/alert";
import { Badge } from "@projection/ui/components/badge";
import { Button } from "@projection/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@projection/ui/components/card";
import {
	Item,
	ItemContent,
	ItemDescription,
	ItemTitle,
} from "@projection/ui/components/item";
import { Skeleton } from "@projection/ui/components/skeleton";
import {
	queryOptions,
	useMutation,
	useSuspenseQuery,
} from "@tanstack/react-query";
import {
	createFileRoute,
	Link,
	notFound,
	redirect,
} from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { authClient } from "@/lib/auth-client";
import { getSsrHeaders } from "@/lib/auth-headers";

const getInviteQry = (inviteId: string) =>
	queryOptions({
		queryKey: ["get_invite", inviteId],
		queryFn: async () => {
			const { data, error } = await authClient.organization.getInvitation({
				query: {
					id: inviteId,
				},
				fetchOptions: {
					headers: getSsrHeaders(),
				},
			});
			if (error) {
				// better-auth only tells us "Invitation not found!" for both
				// unknown ids and invitations belonging to other users
				if (error.message === "Invitation not found!") {
					throw notFound();
				}

				throw error;
			}
			return data;
		},
	});

export const Route = createFileRoute("/auth/v1/invites/")({
	component: RouteComponent,
	validateSearch: z.object({
		inviteId: z.uuid(),
	}),
	beforeLoad: async ({ search, context }) => {
		// We need to be signed in to accept an invite — Microsoft sign-in
		// creates the account (ADR 0004), then returns here via ?redirect=.
		if (!context.session) {
			throw redirect({
				to: "/auth/v1/sign-in",
				search: {
					redirect: `/auth/v1/invites?inviteId=${search.inviteId}`,
				},
			});
		}
	},

	loaderDeps: ({ search: { inviteId } }) => ({
		inviteId,
	}),

	loader: async ({ deps, context }) =>
		await context.queryClient.ensureQueryData(getInviteQry(deps.inviteId)),

	pendingComponent: () => (
		<Card>
			<CardHeader>
				<Skeleton />
			</CardHeader>
			<CardContent>
				<Skeleton />
			</CardContent>
			<CardFooter>
				<Skeleton />
			</CardFooter>
		</Card>
	),
	notFoundComponent: () => (
		<Card>
			<CardHeader>
				<CardTitle>Invitation not found</CardTitle>
				<CardDescription>
					This invitation does not exist, has expired, or was already used.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button
					className="w-full"
					render={<Link to="/auth/v1/organizations" />}
				>
					Choose an organization
				</Button>
			</CardContent>
		</Card>
	),
});

function RouteComponent() {
	const { inviteId } = Route.useLoaderDeps();
	const { data: invitation } = useSuspenseQuery(getInviteQry(inviteId));

	const [error, setError] = useState<string | null>(null);

	const handleDecline = useMutation({
		mutationKey: ["decline_invite", invitation?.id],
		mutationFn: async (invitationId: string) => {
			const { data, error } = await authClient.organization.rejectInvitation({
				invitationId,
			});
			if (error) {
				throw error;
			}
			return data;
		},
		onMutate: () => {
			setError(null);

			toast.loading("Declining your invitation", {
				id: `decline_invite_${invitation?.id}`,
				description: "",
			});
		},

		onSuccess: () => {
			toast.success("Invitation declined", {
				id: `decline_invite_${invitation?.id}`,
				description:
					"If you do need to join this organization, please ask an administrator to invite you.",
			});

			throw redirect({
				to: "/auth/v1/organizations",
			});
		},

		onError: (error) => {
			setError(error.message);

			toast.error("Failed to decline invitation", {
				id: `decline_invite_${invitation?.id}`,
				description: error.message,
			});
		},
	});

	const handleAccept = useMutation({
		mutationKey: ["accept_invite", invitation?.id],
		mutationFn: async (invitationId: string) => {
			const { data, error } = await authClient.organization.acceptInvitation({
				invitationId,
			});
			if (error) {
				throw error;
			}
			return data;
		},
		onMutate: () => {
			setError(null);

			toast.loading("Accepting your invitation", {
				id: `accept_invite_${invitation?.id}`,
				description: "",
			});
		},

		onSuccess: async (data) => {
			toast.success("Invitation accepted", {
				id: `accept_invite_${invitation.id}`,
				description: "You have successfully accepted the invitation.",
			});

			const { data: activeOrg, error: setActiveError } =
				await authClient.organization.setActive({
					organizationId: data.member.organizationId,
				});

			if (setActiveError || !activeOrg) {
				// Failed to set, this may be a caching issue?
				throw redirect({
					to: "/auth/v1/organizations",
				});
			}

			throw redirect({
				to: "/dashboard",
			});
		},

		onError: (error) => {
			setError(error.message);

			toast.error("Failed to accept invitation", {
				id: `accept_invite_${invitation.id}`,
				description: error.message,
			});
		},
	});

	const anyMutationPending = handleDecline.isPending || handleAccept.isPending;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Accept Invitation</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<Item variant={"muted"}>
					<ItemContent>
						<ItemTitle>{invitation.organizationName}</ItemTitle>
						<ItemDescription>
							Invited by: {invitation.inviterEmail ?? invitation.inviterId}
						</ItemDescription>
					</ItemContent>

					<Badge>{invitation.role}</Badge>
				</Item>
				<CardDescription>
					You&apos;re about to join {invitation.organizationName} on projection.
					Your projects stay yours — organization membership does not change who
					can see them.
				</CardDescription>
			</CardContent>

			{error && (
				<Alert variant="destructive">
					<AlertTitle>There was an error processing your request</AlertTitle>
					<AlertDescription>{error}</AlertDescription>
				</Alert>
			)}

			<CardFooter className="gap-2">
				<Button
					disabled={anyMutationPending}
					variant="destructive"
					onClick={() => handleDecline.mutate(invitation?.id)}
				>
					Decline{" "}
					{handleDecline.isPending && (
						<BeachBallIcon className="animate animate-spin ease-in-out" />
					)}
				</Button>
				<Button
					disabled={anyMutationPending}
					onClick={() => handleAccept.mutate(invitation?.id)}
				>
					Accept{" "}
					{handleAccept.isPending && (
						<BeachBallIcon className="animate animate-spin ease-in-out" />
					)}
				</Button>
			</CardFooter>
		</Card>
	);
}
