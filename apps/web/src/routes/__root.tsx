import { SmileyXEyesIcon } from "@phosphor-icons/react";
import type { AppRouter } from "@projection/api/routers/index";
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
} from "@tanstack/react-router";
import { createMiddleware } from "@tanstack/react-start";
import type { TRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { evlogErrorHandler } from "evlog/nitro/v3";
import { lazy } from "react";
import { NotFoundComponent } from "@/components/ui/not-found";
import appCss from "../index.css?url";
export interface RouterAppContext {
	trpc: TRPCOptionsProxy<AppRouter>;
	queryClient: QueryClient;
}

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
		],
	}),

	component: RootDocument,

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
				<div className="grid h-svh grid-rows-[auto_1fr]">
					<Outlet />
				</div>
				<Toaster richColors />
				{DevtoolsPanel && <DevtoolsPanel />}
				<Scripts />
			</body>
		</html>
	);
}
