import { auth } from "@projection/auth";
import {
	type BetterAuthInstance,
	createAuthIdentifier,
} from "evlog/better-auth";
import { definePlugin } from "nitro";

export default definePlugin((nitroApp) => {
	const identify = createAuthIdentifier(auth as BetterAuthInstance, {
		exclude: ["/api/auth/**"],
		maskEmail: true,
	});

	nitroApp.hooks.hook("request", (event) =>
		// evlog is typed against h3 v1 events; nitro v3's HTTPEvent is compatible at runtime
		identify(event as unknown as Parameters<typeof identify>[0]),
	);
});
