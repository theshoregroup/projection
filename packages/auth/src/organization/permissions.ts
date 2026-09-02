import { createAccessControl } from "better-auth/plugins/access";
import {
	adminAc,
	defaultStatements,
	memberAc,
	ownerAc,
} from "better-auth/plugins/organization/access";
import { z } from "zod";

/**
 * Organization access control
 * ===========================
 * Single company org (ADR 0008) — the plugin stock role statements are the
 * whole policy: owner/admin manage the org (settings pages, members,
 * invitations), member can read it. `hasPermission` endpoints enforce this,
 * which is what makes the `/settings` route gate real.
 */
const ac = createAccessControl(defaultStatements);

export const organizationRoles = {
	owner: ac.newRole(ownerAc.statements),
	admin: ac.newRole(adminAc.statements),
	member: ac.newRole(memberAc.statements),
} as const;

export const organizationRoleNames = Object.keys(
	organizationRoles,
) as (keyof typeof organizationRoles)[];

export type OrganizationRoleName = keyof typeof organizationRoles & string;

const organizationPermissionEntries = ac.statements as Record<
	string,
	readonly [string, ...string[]]
>;

/** Typed shape for `organization.hasPermission` bodies (web route gates). */
export const organizationPermissionsSchema = z.object(
	Object.fromEntries(
		Object.entries(organizationPermissionEntries).map(([key, actions]) => [
			key,
			z.array(z.enum(actions as unknown as [string, ...string[]])).optional(),
		]),
	),
);

/** Registered on the web client's `organizationClient` for typed `ac`. */
export const organizationAc = ac;

/** Org roles with management powers (settings pages, member actions). */
export const superuserRoles = ["owner", "admin"] as const;

export function checkRoleForSuperuser(role?: string): boolean {
	return role ? (superuserRoles as readonly string[]).includes(role) : false;
}
