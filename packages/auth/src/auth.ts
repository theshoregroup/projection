import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { createDb } from "@projection/db";
import { activatePendingInvites } from "@projection/db/helpers";
import * as authSchema from "@projection/db/schema/auth";
import { user as userTable } from "@projection/db/schema/auth";
import { env } from "@projection/env/server";
import { tasks } from "@projection/tasks";
import { settingsPlugin } from "@theshoregroup/settings-better-auth-plugin/server";
import { betterAuth } from "better-auth";
import { admin, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
import { organizationAc, organizationRoles } from "./organization/permissions";
import { registry } from "./settings/registry";

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
				requireEmailVerification: true
			},
    },
    emailVerification: {

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
		// The single company organization (ADR 0008). This config only shapes
		// the plugin — it never assigns users to the org. Membership is
		// granted exclusively by the one-off backfill and the invite flow
		// below; sign-in itself is untouched.
		// tanstackStartCookies must stay last in the plugins array
		plugins: [
			organization({
				allowUserToCreateOrganization: true,
				disableOrganizationDeletion: true,
				membershipLimit: 10_000,
				// Enforce the owner/admin/member role policy on org management
				// endpoints (settings gate, member list, invitations…)
				ac: organizationAc,
				roles: organizationRoles,
				// The invite email is the only way a fresh sign-in joins the org
				// (.scratch/org-flow) — lands on the accept/decline page
				sendInvitationEmail: async ({
					invitation,
					organization: org,
					email,
					inviter,
				}) => {
					try {
						await tasks.trigger("email.send", {
							from: "Onboarding <onboarding@projection.com>",
							to: email,
							subject: `${inviter.user.name} invited you to join ${org.name} on projection`,
							props: {
								key: "org-invite",
								data: {
									organizationName: org.name,
									inviterName: inviter.user.name,
									inviteeEmail: email,
									acceptUrl: `${env.BETTER_AUTH_URL}/auth/v1/invites?inviteId=${invitation.id}`,
								},
							},
						});
					} catch (error) {
						// The invitation row is the source of truth — a failed send
						// never fails the invite (same pattern as sharing.ts)
						console.warn("[auth] org invite email failed to trigger", error);
					}
				},
			}),
			settingsPlugin({
				registry,
				withOrg: true,
			}),
			admin(),
			tanstackStartCookies(),
		],
	});
}

export const auth = createAuth();

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];

export * from "./organization/permissions";
