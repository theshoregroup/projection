import type { AppRouter } from "@projection/api/routers/index";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import {
	createRouter as createTanStackRouter,
	notFound,
} from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { getRequestHeaders, getRequestUrl } from "@tanstack/react-start/server";
import {
	createTRPCClient,
	httpBatchLink,
	isTRPCClientError,
} from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";
import SuperJSON from "superjson";
import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";
import { TRPCProvider } from "./utils/trpc";

function createQueryClient() {
	return new QueryClient({
		queryCache: new QueryCache({
			onError: (error, query) => {
				console.log(error);

				if (
					isTRPCClientError(error) &&
					error.data?.code === "NOT_FOUND" &&
					!query.meta?.disableThrowOnNotFound
				) {
					query.cancel();
					throw notFound({ data: error });
				}

				toast.error(error.message, {
					action: {
						label: "retry",
						onClick: () => {
							query.invalidate();
						},
					},
				});
			},
		}),
		defaultOptions: { queries: { staleTime: 60 * 1000 } },
	});
}

const trpcClient = createTRPCClient<AppRouter>({
	links: [
		httpBatchLink({
			url: "/api/trpc",
			transformer: SuperJSON,
			fetch(url, options) {
				if (typeof window === "undefined") {
					// SSR: Node's fetch requires an absolute URL, and the incoming
					// request's cookies must be forwarded explicitly for auth.
					const headers = new Headers(options?.headers);
					const cookie = getRequestHeaders().get("cookie");
					if (cookie) {
						headers.set("cookie", cookie);
					}
					return fetch(new URL(String(url), getRequestUrl().origin), {
						...options,
						headers,
					});
				}
				return fetch(url, {
					...options,
					credentials: "include",
				});
			},
		}),
	],
});

export const getRouter = () => {
	const queryClient = createQueryClient();
	const trpc = createTRPCOptionsProxy({
		client: trpcClient,
		queryClient,
	});

	const router = createTanStackRouter({
		routeTree,
		scrollRestoration: true,
		defaultPreloadStaleTime: 0,
		context: { trpc, queryClient },
		defaultPendingComponent: () => <Loader />,
		defaultNotFoundComponent: () => <div>Not Found</div>,
		Wrap: ({ children }) => (
			<TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
				{children}
			</TRPCProvider>
		),
	});

	setupRouterSsrQueryIntegration({
		router,
		queryClient,
	});

	return router;
};

declare module "@tanstack/react-router" {
	interface Register {
		router: ReturnType<typeof getRouter>;
	}
}
