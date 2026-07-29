import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { createDb } from "@projection/db";
import { activatePendingInvites } from "@projection/db/helpers";
import * as authSchema from "@projection/db/schema/auth";
import { user as userTable } from "@projection/db/schema/auth";
import { env } from "@projection/env/server";
import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";

// Emails granted the admin role automatically at sign-up (ADR 0004)
const adminEmails = env.ADMIN_EMAILS.split(",")
	.map((email) => email.trim().toLowerCase())
	.filter(Boolean);

export function createAuth() {
	const db = createDb();

	return betterAuth({
		appName: "projection",
		database: drizzleAdapter(db, {
			provider: "pg",
			schema: authSchema,
		}),
		trustedOrigins: [env.CORS_ORIGIN],
		// Microsoft OAuth only — single Entra tenant, open signup within it (ADR 0004)
		socialProviders: {
			microsoft: {
				clientId: env.AZURE_CLIENT_ID,
				clientSecret: env.AZURE_CLIENT_SECRET,
				tenantId: env.AZURE_TENANT_ID,
			},
		},
		databaseHooks: {
			user: {
				create: {
					after: async (user) => {
						if (adminEmails.includes(user.email.toLowerCase())) {
							await db
								.update(userTable)
								.set({ role: "admin" })
								.where(eq(userTable.id, user.id));
						}
						// Pending Invites become active Editors on first sign-in
						await activatePendingInvites(db, {
							userId: user.id,
							email: user.email,
						});
					},
				},
			},
		},
		secret: env.BETTER_AUTH_SECRET,
		baseURL: env.BETTER_AUTH_URL,
		// tanstackStartCookies must stay last in the plugins array
		plugins: [admin(), tanstackStartCookies()],
	});
}

export const auth = createAuth();
