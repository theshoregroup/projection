import { env } from "@projection/env/server";
import { PostHog } from "posthog-node";

/**
 * Singleton PostHog Node client for server-side event & exception capture.
 *
 * Uses the shared `VITE_PUBLIC_*` env vars validated by `@projection/env` —
 * client and server use the same token/host, so identity links correctly
 * across client-side identify() calls and server-side capture.
 *
 * Call `posthog.shutdown()` when the process exits (most servers handle this
 * via their shutdown hook; the Nitro/Vercel build already does).
 */
export const posthog = new PostHog(env.VITE_PUBLIC_POSTHOG_PROJECT_TOKEN, {
	host: env.VITE_PUBLIC_POSTHOG_HOST,
	// Don't batch in development so events appear immediately
	flushAt: env.NODE_ENV === "development" ? 1 : 20,
	flushInterval: env.NODE_ENV === "development" ? 0 : 10_000,
});


