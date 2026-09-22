import { SmileyXEyesIcon } from "@phosphor-icons/react";
import {
	PostHogErrorBoundary,
	PostHogProvider,
	usePostHog,
} from "@posthog/react";
import type { AppRouter } from "@projection/api/routers/index";
import { auth, type Session } from "@projection/auth";
import { env as webEnv } from "@projection/env/web";
import { Button } from "@projection/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@projection/ui/components/empty";
import { Toaster } from "@projection/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Link,
	Outlet,
	Scripts,
	useRouter,
} from "@tanstack/react-router";
import { createMiddleware, createServerFn } from "@tanstack/react-start";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { evlogErrorHandler } from "evlog/nitro/v3";
import { lazy, type ReactNode, useEffect, useRef } from "react";
import { NotFoundComponent } from "@/components/ui/not-found";
import { authClient } from "@/lib/auth-client";
import appCss from "../index.css?url";
export interface RouterAppContext {
	trpc: TRPCOptionsProxy<AppRouter>;
	queryClient: QueryClient;
	session: Session["session"] | undefined;
	user: Session["user"] | undefined;
}

const getSession = createServerFn({ method: "GET" }).handler(async () => {
	const { getRequestHeaders } = await import("@tanstack/react-start/server");

	const headers = getRequestHeaders();

	return auth.api.getSession({ headers });
});

const DevtoolsPanel = import.meta.env.DEV
	? lazy(() =>
			import("../components/devtools").then((m) => ({
				default: m.DevtoolsPanel,
			})),
		)
	: null;

export const Route = createRootRouteWithContext<RouterAppContext>()({
	server: {
		middleware: [createMiddleware().server(evlogErrorHandler)],
	},

	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1",
			},
			{
				title: "projection",
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			{
				rel: "apple-touch-icon",
				sizes: "57x57",
				href: "/apple-icon-57x57.png",
			},
			{
				rel: "apple-touch-icon",
				sizes: "60x60",
				href: "/apple-icon-60x60.png",
			},
			{
				rel: "apple-touch-icon",
				sizes: "72x72",
				href: "/apple-icon-72x72.png",
			},
			{
				rel: "apple-touch-icon",
				sizes: "76x76",
				href: "/apple-icon-76x76.png",
			},
			{
				rel: "apple-touch-icon",
				sizes: "114x114",
				href: "/apple-icon-114x114.png",
			},
			{
				rel: "apple-touch-icon",
				sizes: "120x120",
				href: "/apple-icon-120x120.png",
			},
			{
				rel: "apple-touch-icon",
				sizes: "144x144",
				href: "/apple-icon-144x144.png",
			},
			{
				rel: "apple-touch-icon",
				sizes: "152x152",
				href: "/apple-icon-152x152.png",
			},
			{
				rel: "apple-touch-icon",
				sizes: "180x180",
				href: "/apple-icon-180x180.png",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "192x192",
				href: "/android-icon-192x192.png",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "32x32",
				href: "/favicon-32x32.png",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "96x96",
				href: "/favicon-96x96.png",
			},
			{
				rel: "icon",
				type: "image/png",
				sizes: "16x16",
				href: "/favicon-16x16.png",
			},
			{ rel: "manifest", href: "/manifest.json" },
		],
	}),

	component: RootDocument,

	beforeLoad: async () => {
		// Fetched for every route so children can gate synchronously on
		// session/user in beforeLoad (openrams pattern). The client-side
		// AuthGate below re-routes when the session changes.
		const data = await getSession();

		return {
			session: data?.session ?? undefined,
			user: data?.user ?? undefined,
		};
	},

	errorComponent: ({ error, reset }) => {
		return (
			<div className="grid h-full w-full place-items-center bg-muted p-6">
				<Empty className="w-fit bg-background">
					<EmptyHeader>
						<EmptyMedia variant={"icon"}>
							<SmileyXEyesIcon />
						</EmptyMedia>
						<EmptyTitle>Well that's embarassing</EmptyTitle>
						<EmptyDescription>
							We've run into an error. If you keep getting this, please contact
							support.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<code className="bg-muted p-2 text-red-400">{error?.message}</code>

						<div className="flex gap-2">
							<Button onClick={reset}>Try again</Button>
							<Button variant={"outline"} render={<Link to={"/"} />}>
								Go home
							</Button>
						</div>
					</EmptyContent>
				</Empty>
			</div>
		);
	},

	notFoundComponent: (props) => {
		return (
			<div className="grid h-screen w-screen place-items-center bg-muted p-6">
				<NotFoundComponent {...props} />
			</div>
		);
	},
});

function RootDocument() {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				<PostHogRoot>
					<div className="grid h-svh grid-rows-[auto_1fr]">
						<Outlet />
					</div>
					<Toaster richColors />
					{DevtoolsPanel && <DevtoolsPanel />}
					<AuthGate />
				</PostHogRoot>
				<Scripts />
			</body>
		</html>
	);
}

function PostHogRoot({ children }: { children: ReactNode }) {
	// Validated at build/startup by @t3-oss/env-core — impossible to reach
	// runtime without these vars satisfying the schema.
	const apiKey = webEnv.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN;
	const apiHost = webEnv.VITE_PUBLIC_POSTHOG_HOST;

	return (
		<PostHogProvider
			apiKey={apiKey}
			options={{
				api_host: apiHost,
				capture_exceptions: true,
				debug: import.meta.env.DEV,
				defaults: "2025-05-24",
			}}
		>
			<PostHogIdentity />
			<PostHogErrorBoundary>{children}</PostHogErrorBoundary>
		</PostHogProvider>
	);
}

function PostHogIdentity() {
	const { data: sessionData, isPending } = authClient.useSession();
	const posthog = usePostHog();
	const identifiedUserId = useRef<string | null>(null);
	const user = sessionData?.user;

	useEffect(() => {
		if (isPending) return;

		if (!user) {
			if (identifiedUserId.current) {
				posthog.reset();
				identifiedUserId.current = null;
			}
			return;
		}

		if (identifiedUserId.current === user.id) return;

		if (identifiedUserId.current) {
			posthog.reset();
		}

		posthog.identify(user.id, {
			email: user.email,
			name: user.name,
			role: user.role ?? undefined,
		});
		identifiedUserId.current = user.id;
	}, [isPending, posthog, user]);

	return null;
}

// Re-routes the whole app whenever the client session changes (sign-in /
// sign-out / org switch) so server-gated routes pick up the new state.
function AuthGate() {
	const session = authClient.useSession();
	const router = useRouter();

	// biome-ignore lint/correctness/useExhaustiveDependencies: this is the correct way to invalidate the router
	useEffect(() => {
		router.invalidate();
	}, [session]);

	return null;
}
