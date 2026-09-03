import type { DrizzleDbType } from "@projection/db";
import { organization, settings } from "@projection/db/schema/auth";
import { and, eq, isNull } from "drizzle-orm";

/** Look up the org's logo URL when show_org_logo_on_exports is true.
 *  Returns undefined when the setting is off, the org has no logo, or the
 *  project has no org. */
export async function resolveOrgLogo(
	db: DrizzleDbType,
	orgId: string | null,
): Promise<string | undefined> {
	if (!orgId) return undefined;
	const [setting] = await db
		.select({ value: settings.value })
		.from(settings)
		.where(
			and(
				eq(settings.key, "show_org_logo_on_exports"),
				eq(settings.organizationId, orgId),
				isNull(settings.userId),
			),
		);
	if (setting?.value !== "true") return undefined;
	const [org] = await db
		.select({ logo: organization.logo })
		.from(organization)
		.where(eq(organization.id, orgId));
	return org?.logo ?? undefined;
}