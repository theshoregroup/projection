import type { auth } from "@projection/auth";
import {
	organizationAc,
	organizationRoles,
} from "@projection/auth/organization/permissions";
import { useNavigate } from "@tanstack/react-router";
import { createIsomorphicFn } from "@tanstack/react-start";
import {
	adminClient,
	inferAdditionalFields,
	inferOrgAdditionalFields,
	organizationClient,
} from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { useState } from "react";
import { toast } from "sonner";

// Explicit baseURL for SSR. Without it the client falls back through
// process.env and finally a relative "/api/auth" — which throws in Node
// (fetch needs absolute URLs) for any server-side authClient call.
// createIsomorphicFn splits per-bundle, so the dynamic server-env import
// never reaches the client bundle; the browser keeps its default.
const resolveBaseURL = createIsomorphicFn()
	.server(
		async () => (await import("@projection/env/server")).env.BETTER_AUTH_URL,
	)
	.client(() => undefined);

export const authClient = createAuthClient({
	baseURL: await resolveBaseURL(),
	plugins: [
		adminClient(),
		organizationClient({
			ac: organizationAc,
			roles: organizationRoles,
			schema: inferOrgAdditionalFields<typeof auth>(),
		}),
		inferAdditionalFields<typeof auth>(),
	],
});

/**
 * Sign-out with navigation + feedback. Sign-in is handled on the sign-in
 * page itself; sign-out lives here because several surfaces trigger it.
 */
export const useSignOut = () => {
	const navigate = useNavigate();

	const [isPending, setIsPending] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const signOut = () =>
		authClient.signOut({
			fetchOptions: {
				onRequest: () => {
					setIsPending(true);
					setError(null);
				},
				onSuccess: () => {
					navigate({ to: "/" });
				},
				onError: ({ error }) => {
					setError(error);

					toast.error("There was an error signing you out", {
						description: error.message,
					});

					navigate({ to: "/" });
				},
				onResponse: () => {
					setIsPending(false);
				},
			},
		});

	return { signOut, isPending, error };
};
