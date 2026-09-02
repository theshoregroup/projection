import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@projection/ui/components/avatar";
import { Card, CardContent, CardTitle } from "@projection/ui/components/card";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { getOrgShortName } from "@/utils/auth";

const currentOrganizationQry = (orgId: string) =>
	queryOptions({
		queryKey: ["currentOrganization", orgId],
		queryFn: async () => {
			const { data, error } = await authClient.organization.getFullOrganization(
				{
					query: { organizationId: orgId },
				},
			);
			if (error) throw error;
			return data;
		},
	});

export const Route = createFileRoute("/_org/settings/")({
	component: RouteComponent,
	loader: async ({ context }) =>
		await context.queryClient.ensureQueryData(
			currentOrganizationQry(context.activeOrganizationId),
		),
});

function RouteComponent() {
	const { activeOrganizationId } = Route.useRouteContext({
		select: ({ activeOrganizationId }) => ({ activeOrganizationId }),
	});
	const { data: organization } = useSuspenseQuery(
		currentOrganizationQry(activeOrganizationId),
	);

	return (
		<div className="mt-4">
			<Card>
				<CardContent className="flex items-start gap-4">
					<Avatar size="lg">
						<AvatarFallback>
							{getOrgShortName(organization.name)}
						</AvatarFallback>
						{organization.logo && <AvatarImage src={organization.logo} />}
					</Avatar>

					<div className="w-full space-y-2">
						<CardTitle className="text-xl">{organization.name}</CardTitle>
						<div className="text-muted-foreground text-sm">
							/{organization.slug}
						</div>

						<div className="flex w-full flex-wrap gap-6">
							<div className="min-w-24 grow basis-0 space-y-2 rounded-sm bg-muted p-2">
								<div className="text-muted-foreground text-xs">Members</div>
								<div className="font-medium text-lg">
									{organization.members.length}
								</div>
							</div>

							<div className="min-w-24 grow basis-0 space-y-2 rounded-sm bg-muted p-2">
								<div className="text-muted-foreground text-xs">
									Pending Invites
								</div>
								<div className="font-medium text-lg">
									{organization.invitations.length}
								</div>
							</div>

							<div className="min-w-24 grow basis-0 space-y-2 rounded-sm bg-muted p-2">
								<div className="text-muted-foreground text-xs">Created</div>
								<div className="font-medium text-lg">
									{organization.createdAt.toLocaleDateString()}
								</div>
							</div>
						</div>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
