import { env } from "@projection/env/server";
import { tasks } from "@projection/tasks";
import type { sendEmail } from "@projection/tasks/email";
import { organization } from "better-auth/plugins";
import { organizationAc, organizationRoles } from "./permissions";

export const orgPluginConfig = organization({
	allowUserToCreateOrganization: true,
	disableOrganizationDeletion: true,
	membershipLimit: 10_000,

	ac: organizationAc,
	roles: organizationRoles,

	sendInvitationEmail: async ({
		invitation,
		organization: org,
		email,
		inviter,
	}) => {
		await tasks.trigger<typeof sendEmail>("email.send", {
			from: "Accounts <accounts@theshoregroup.org>",
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
	},
});
