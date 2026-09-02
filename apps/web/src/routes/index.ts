import { createFileRoute, redirect } from "@tanstack/react-router";
import { redirectPath } from "@/utils/redirect";

export const Route = createFileRoute("/")({
	beforeLoad: ({ context }) => {
		const { session } = context;

		if (session) {
			if (session.activeOrganizationId) {
				throw redirect({ from: "/", to: "/dashboard" });
			}
			// Signed in but in no organization (fresh sign-in before an
			// invite is accepted) — the picker is the only door in.
			throw redirectPath("/auth/v1/organizations", {
				redirect: "/dashboard",
			});
		}

		throw redirect({ from: "/", to: "/auth/v1/sign-in" });
	},
});
