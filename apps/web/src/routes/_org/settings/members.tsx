import { PlusCircleIcon, TrashIcon } from "@phosphor-icons/react/dist/ssr";
import { Badge } from "@projection/ui/components/badge";
import { Button } from "@projection/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@projection/ui/components/card";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@projection/ui/components/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@projection/ui/components/table";
import {
	queryOptions,
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { formatDate } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";
import { InviteMemberDialog } from "@/components/member/invite-dialog";
import { authClient } from "@/lib/auth-client";
import { requireOrgPermission } from "@/lib/permissions";

const membersQry = queryOptions({
	queryKey: ["getMembers"],
	queryFn: async () => {
		const { data, error } = await authClient.organization.listMembers();
		if (error) throw error;
		return data;
	},
});

const invitationsQry = queryOptions({
	queryKey: ["invitations"],
	queryFn: async () => {
		const { data, error } = await authClient.organization.listInvitations();
		if (error) throw error;
		return data ?? [];
	},
});

type MembersResult = NonNullable<
	Awaited<ReturnType<NonNullable<(typeof membersQry)["queryFn"]>>>
>;
type MemberRow = MembersResult["members"][number];

export const Route = createFileRoute("/_org/settings/members")({
	beforeLoad: () => requireOrgPermission({ member: ["update"] }, "throw"),
	loader: async ({ context }) =>
		await Promise.all([
			context.queryClient.ensureQueryData(membersQry),
			context.queryClient.ensureQueryData(invitationsQry),
		]),
	component: RouteComponent,
});

function RouteComponent() {
	const { data: sessionData } = authClient.useSession();
	const { data } = useSuspenseQuery(membersQry);
	const { data: invitations } = useSuspenseQuery(invitationsQry);
	const queryClient = useQueryClient();

	const [inviteOpen, setInviteOpen] = useState(false);

	const handleRemove = useMutation({
		mutationKey: ["remove_member"],
		mutationFn: async (memberId: string) => {
			const { data, error } = await authClient.organization.removeMember({
				memberIdOrEmail: memberId,
			});
			if (error) throw error;
			return data;
		},
		onMutate: (memberId) =>
			toast.loading("Removing member...", { id: `remove_member_${memberId}` }),
		onSuccess: async (_, memberId) => {
			toast.success("Member removed", { id: `remove_member_${memberId}` });
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["getMembers"] }),
				queryClient.invalidateQueries({ queryKey: ["currentOrganization"] }),
			]);
		},
		onError: (error, memberId) =>
			toast.error("Failed to remove member", {
				id: `remove_member_${memberId}`,
				description: error.message,
			}),
	});

	const handleRevoke = useMutation({
		mutationKey: ["remove_invitation"],
		mutationFn: async (invitationId: string) => {
			const { data, error } = await authClient.organization.cancelInvitation({
				invitationId,
			});
			if (error) throw error;
			return data;
		},
		onSuccess: async (_, invitationId) => {
			toast.success("Invitation revoked", {
				id: `revoke_invite_${invitationId}`,
			});
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["invitations"] }),
				queryClient.invalidateQueries({ queryKey: ["currentOrganization"] }),
			]);
		},
		onError: (error, invitationId) =>
			toast.error("Failed to revoke invitation", {
				id: `revoke_invite_${invitationId}`,
				description: error.message,
			}),
	});

	const me = sessionData?.user.id;

	return (
		<div className="mt-4 space-y-4">
			<div className="flex flex-row justify-end gap-4">
				<Button onClick={() => setInviteOpen(true)}>
					<PlusCircleIcon /> Invite member
				</Button>
			</div>

			<div className="overflow-hidden rounded-md border">
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Name</TableHead>
							<TableHead>Email</TableHead>
							<TableHead>Role</TableHead>
							<TableHead>Joined</TableHead>
							<TableHead className="w-fit text-right">Actions</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{data.members.map((member: MemberRow) => (
							<TableRow key={member.id}>
								<TableCell className="font-medium">
									{member.user?.name}
								</TableCell>
								<TableCell>{member.user?.email}</TableCell>
								<TableCell>
									<Badge variant={"secondary"} className="font-mono">
										{member.role}
									</Badge>
								</TableCell>
								<TableCell>
									{member.createdAt ? formatDate(member.createdAt, "PPP") : "—"}
								</TableCell>
								<TableCell className="text-right">
									<DropdownMenu>
										<DropdownMenuTrigger
											render={
												<Button
													variant="ghost"
													size="icon"
													className="size-8"
												/>
											}
										/>
										<DropdownMenuContent align="end">
											<DropdownMenuItem
												variant="destructive"
												disabled={
													member.user?.id === me || handleRemove.isPending
												}
												onClick={() => handleRemove.mutate(member.id)}
											>
												<TrashIcon /> Remove member
											</DropdownMenuItem>
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			{invitations.length > 0 && (
				<Card>
					<CardHeader>
						<CardTitle>Pending invitations</CardTitle>
						<CardDescription>
							Invitations that have not been accepted yet
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						{invitations.map((invitation) => (
							<div
								key={invitation.id}
								className="flex items-center justify-between rounded-md border p-3"
							>
								<div className="flex flex-col gap-0.5">
									<span className="font-medium">{invitation.email}</span>
									<span className="text-muted-foreground text-sm">
										Expires {formatDate(invitation.expiresAt, "PPP")}
									</span>
								</div>
								<div className="flex items-center gap-2">
									<Badge variant="secondary" className="font-mono">
										{invitation.role ?? "member"}
									</Badge>
									<Button
										variant="outline"
										size="sm"
										disabled={handleRevoke.isPending}
										onClick={() => handleRevoke.mutate(invitation.id)}
									>
										Revoke
									</Button>
								</div>
							</div>
						))}
					</CardContent>
				</Card>
			)}

			<InviteMemberDialog open={inviteOpen} onOpenChange={setInviteOpen} />
		</div>
	);
}
