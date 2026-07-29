import { Badge } from "@projection/ui/components/badge";
import { Button } from "@projection/ui/components/button";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { getUser } from "@/functions/get-user";
import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/_auth/admin")({
	beforeLoad: async () => {
		const session = await getUser();
		if (session?.user?.role !== "admin") {
			throw redirect({ to: "/" });
		}
		return { session };
	},
	component: AdminPage,
});

interface AdminUserRow {
	id: string;
	name: string;
	email: string;
	role?: string | null;
	banned?: boolean | null;
}

/** Admin = user management only (ADR 0004) — no project access lives here. */
function AdminPage() {
	const { session } = Route.useRouteContext();
	const [users, setUsers] = useState<AdminUserRow[]>([]);
	const [loading, setLoading] = useState(true);

	const load = useCallback(async () => {
		setLoading(true);
		const result = await authClient.admin.listUsers({ query: { limit: 200 } });
		if (result.error) {
			toast.error(result.error.message ?? "Couldn't load users");
		} else {
			setUsers((result.data?.users ?? []) as unknown as AdminUserRow[]);
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		void load();
	}, [load]);

	const act = async (
		action: Promise<{ error?: { message?: string } | null }>,
		done: string,
	) => {
		const result = await action;
		if (result.error) {
			toast.error(result.error.message ?? "Action failed");
		} else {
			toast.success(done);
			await load();
		}
	};

	const me = session.user.id;

	return (
		<div className="mx-auto w-full max-w-4xl space-y-6 p-6">
			<h1 className="font-semibold text-2xl">User management</h1>
			{loading ? (
				<p className="text-muted-foreground text-sm">Loading users…</p>
			) : (
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b text-left text-muted-foreground">
							<th className="py-2 font-medium">Name</th>
							<th className="font-medium">Email</th>
							<th className="font-medium">Role</th>
							<th className="font-medium">Status</th>
							<th className="font-medium" />
						</tr>
					</thead>
					<tbody>
						{users.map((user) => (
							<tr key={user.id} className="border-b">
								<td className="py-2">{user.name}</td>
								<td>{user.email}</td>
								<td>
									<Badge
										variant={user.role === "admin" ? "default" : "secondary"}
									>
										{user.role === "admin" ? "Admin" : "User"}
									</Badge>
								</td>
								<td>
									{user.banned ? (
										<Badge variant="destructive">Banned</Badge>
									) : (
										"Active"
									)}
								</td>
								<td className="space-x-2 text-right">
									{user.role === "admin" ? (
										<Button
											variant="ghost"
											size="sm"
											disabled={user.id === me}
											onClick={() =>
												void act(
													authClient.admin.setRole({
														userId: user.id,
														role: "user",
													}),
													"Admin removed",
												)
											}
										>
											Remove admin
										</Button>
									) : (
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												void act(
													authClient.admin.setRole({
														userId: user.id,
														role: "admin",
													}),
													"Admin granted",
												)
											}
										>
											Make admin
										</Button>
									)}
									{user.banned ? (
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												void act(
													authClient.admin.unbanUser({ userId: user.id }),
													"User unbanned",
												)
											}
										>
											Unban
										</Button>
									) : (
										<Button
											variant="ghost"
											size="sm"
											disabled={user.id === me}
											onClick={() =>
												void act(
													authClient.admin.banUser({ userId: user.id }),
													"User banned",
												)
											}
										>
											Ban
										</Button>
									)}
									<Button
										variant="ghost"
										size="sm"
										className="text-destructive"
										disabled={user.id === me}
										onClick={() =>
											void act(
												authClient.admin.removeUser({ userId: user.id }),
												"User deleted",
											)
										}
									>
										Delete
									</Button>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			)}
		</div>
	);
}
