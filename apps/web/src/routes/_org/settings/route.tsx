import { TabsList, TabsTrigger } from "@projection/ui/components/tabs";
import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useRouteTabs } from "@/components/route-tabs";
import { requireOrgPermission } from "@/lib/permissions";

export const Route = createFileRoute("/_org/settings")({
	beforeLoad: async ({ context }) => {
		// Ensure the user can manage the organization
		await requireOrgPermission({ member: ["update"] }, "throw");

		// Narrow the active org id for children (guaranteed by the _org gate)
		const activeOrganizationId = context.session.activeOrganizationId as string;
		return { activeOrganizationId };
	},
	component: RouteComponent,
});

function RouteComponent() {
	const Tabs = useRouteTabs({ from: "/settings", defaultTo: "profile" });

	return (
		<Tabs className="p-4">
			<div className="flex items-end justify-between pt-10">
				<div>
					<h1 className="font-semibold text-4xl">Organization Settings</h1>
					<p className="text-muted-foreground">
						Change your organization&apos;s settings
					</p>

					<TabsList className="mt-2">
						<TabsTrigger value={"profile"}>Profile</TabsTrigger>
						<TabsTrigger value={"members"}>Members</TabsTrigger>
					</TabsList>
				</div>
			</div>

			<Outlet />
		</Tabs>
	);
}
