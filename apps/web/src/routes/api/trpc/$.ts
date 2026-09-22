import { createContext } from "@projection/api/context";
import { posthog } from "@projection/auth/posthog";
import { appRouter } from "@projection/api/routers/index";
import { createFileRoute } from "@tanstack/react-router";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

function handler({ request }: { request: Request }) {
	return fetchRequestHandler({
		req: request,
		router: appRouter,
		createContext,
		endpoint: "/api/trpc",
		onError: ({ error, ctx }) => {
			if (error.code === "INTERNAL_SERVER_ERROR") {
				posthog.captureException(
					error.cause ?? error,
					ctx?.session?.user?.id,
				);
			}
		},
	});
}

export const Route = createFileRoute("/api/trpc/$")({
	server: {
		handlers: {
			GET: handler,
			POST: handler,
		},
	},
});
