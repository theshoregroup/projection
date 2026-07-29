import { Button } from "@projection/ui/components/button";
import { createFileRoute } from "@tanstack/react-router";

import { authClient } from "@/lib/auth-client";

export const Route = createFileRoute("/login")({
	component: RouteComponent,
});

function RouteComponent() {
	return (
		<div className="flex h-full items-center justify-center p-6">
			<div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-lg border p-8 text-center">
				<div className="space-y-1">
					<h1 className="font-semibold text-2xl">projection</h1>
					<p className="text-muted-foreground text-sm">
						Sign in with your work Microsoft account to continue.
					</p>
				</div>
				<Button
					className="w-full"
					size="lg"
					onClick={() =>
						authClient.signIn.social({
							provider: "microsoft",
							callbackURL: "/",
						})
					}
				>
					Continue with Microsoft
				</Button>
			</div>
		</div>
	);
}
