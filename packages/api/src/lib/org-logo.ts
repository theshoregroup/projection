import type { DrizzleDbType } from "@projection/db";
import { organization, settings } from "@projection/db/schema/auth";
import { and, eq, isNull } from "drizzle-orm";
import sharp from "sharp";

/** Fetch the logo image and convert it to a PNG data URI (react-pdf only
 *  supports JPEG, PNG, and SVG — WebP and other formats must be transcoded).
 *  Returns undefined when the fetch or conversion fails. */
async function fetchAsPngDataUri(url: string): Promise<string | undefined> {
	try {
		const response = await fetch(url);
		if (!response.ok) return undefined;
		const buffer = Buffer.from(await response.arrayBuffer());
		const png = await sharp(buffer).png().toBuffer();
		return `data:image/png;base64,${png.toString("base64")}`;
	} catch {
		return undefined;
	}
}

/** Look up the org's logo URL when show_org_logo_on_exports is true, fetch
 *  the image, and return it as a PNG data URI suitable for react-pdf's <Image>.
 *  Returns undefined when the setting is off, the org has no logo, or image
 *  conversion fails. */
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
	if (!org?.logo) return undefined;
	return fetchAsPngDataUri(org.logo);
}