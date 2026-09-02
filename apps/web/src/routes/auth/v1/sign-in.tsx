import { TriangleIcon } from "@phosphor-icons/react";
import { Button } from "@projection/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@projection/ui/components/card";
import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod/v4";
import { authClient } from "@/lib/auth-client";
import { redirectPath } from "@/utils/redirect";

export const Route = createFileRoute("/auth/v1/sign-in")({
	component: RouteComponent,
	validateSearch: z.object({
		redirect: z.string().optional(),
	}),
	beforeLoad: async ({ context, search }) => {
		const { session } = context;

		if (!session) return;

		// Already signed in — carry any requested destination, otherwise
		// land where the app would anyway (dashboard, or the picker when
		// the user is in no organization yet).
		const target =
			search.redirect && !search.redirect.startsWith("/auth/v1/sign-in")
				? search.redirect
				: session.activeOrganizationId
					? "/dashboard"
					: "/auth/v1/organizations";

		if (target !== "/auth/v1/sign-in") {
			throw redirectPath(target);
		}
	},
});

function RouteComponent() {
	const search = Route.useSearch();
	const { session } = Route.useRouteContext({
		select: ({ session }) => ({ session }),
	});

	const callbackURL =
		search.redirect ??
		(session?.activeOrganizationId ? "/dashboard" : "/auth/v1/organizations");

	return (
		<Card>
			<CardHeader>
				<CardTitle>Sign In</CardTitle>
				<CardDescription>
					Sign in with your work Microsoft account to continue.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Button
					className="w-full"
					size="lg"
					onClick={() =>
						authClient.signIn.social({
							provider: "microsoft",
							callbackURL,
							fetchOptions: {
								onError: ({ error }) => {
									toast.error("Sign in failed", {
										description: error.message,
									});
								},
							},
						})
					}
				>
					Continue with Microsoft
					<TriangleIcon className="rotate-90" weight="duotone" />
				</Button>
			</CardContent>
			<CardFooter>
				<CardDescription>
					Not in your organization yet? Ask an admin to invite your work email —
					you&apos;ll get a link to accept.
				</CardDescription>
			</CardFooter>
		</Card>
	);
}
