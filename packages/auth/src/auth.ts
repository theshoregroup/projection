import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { createDb } from "@projection/db";
import { env } from "@projection/env/server";
import { betterAuth } from "better-auth";
import { tanstackStartCookies } from "better-auth/tanstack-start";

export function createAuth() {
	const db = createDb();

	return betterAuth({
		appName: "cibiprojection",
		database: drizzleAdapter(db, {
      provider: "pg",
      schemaName: "auth",
		}),
		trustedOrigins: [env.CORS_ORIGIN],
		emailAndPassword: {
			enabled: true,
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		plugins: [tanstackStartCookies()],
	});
}

export const auth = createAuth();
