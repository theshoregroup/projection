import { createFileRoute, redirect } from "@tanstack/react-router";

// Kept as a redirect for old bookmarks and in-flight OAuth callbacks.
export const Route = createFileRoute("/login")({
	beforeLoad: () => {
		throw redirect({ to: "/auth/v1/sign-in" });
	},
});
