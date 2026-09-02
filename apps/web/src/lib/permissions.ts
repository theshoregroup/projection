import type { organizationPermissionsSchema } from "@projection/auth/organization/permissions";
import { redirect } from "@tanstack/react-router";
import type z from "zod/v4";
import { authClient } from "@/lib/auth-client";
import { getSsrHeaders } from "@/lib/auth-headers";

type OrganizationPermissions = z.infer<typeof organizationPermissionsSchema>;

/**
 * Probe whether the current user has the given organization permissions.
 * Returns `true` if allowed, `false` if denied or if the organization
 * context is missing. Never throws.
 */
export async function probeOrgPermission(
	permissions: OrganizationPermissions,
): Promise<boolean> {
	const { data, error } = await authClient.organization.hasPermission(
		{ permissions },
		{ headers: getSsrHeaders() },
	);
	if (error || !data?.success) return false;
	return true;
}

/**
 * Require the given organization permissions. Throws a TanStack `redirect`
 * when denied — use in route `beforeLoad` where a redirect is the desired
 * behaviour. Throws an Error in "throw" mode for non-route call sites.
 */
export async function requireOrgPermission(
	permissions: OrganizationPermissions,
	mode: "redirect" | "throw" = "redirect",
	redirectTo = "/dashboard",
): Promise<void> {
	const { data, error } = await authClient.organization.hasPermission(
		{ permissions },
		{ headers: getSsrHeaders() },
	);
	if (error || !data?.success) {
		if (mode === "redirect") {
			throw redirect({ to: redirectTo });
		}
		throw new Error("FORBIDDEN", { cause: error });
	}
}
