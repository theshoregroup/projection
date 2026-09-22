import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export const env = createEnv({
	clientPrefix: "VITE_",
	client: {},
	shared: {
		VITE_PUBLIC_POSTHOG_PROJECT_TOKEN: z.string(),
		VITE_PUBLIC_POSTHOG_HOST: z.url().catch("https://eu.i.posthog.com"),
	},
	// biome-ignore lint/suspicious/noExplicitAny: safe here! Used for typing :)
	runtimeEnv: (import.meta as any).env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
