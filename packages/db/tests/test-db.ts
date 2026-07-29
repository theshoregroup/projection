import { randomUUID } from "node:crypto";
import { Temporal } from "@theshoregroup/time";
import { drizzle } from "drizzle-orm/node-postgres";
import { DatabaseError } from "pg";
import { expect } from "vitest";
import { relations } from "../src/relations";
import { organization, team, teamMember, user } from "../src/schema/auth";
import { document } from "../src/schema/document";
import { file } from "../src/schema/file";
import { person } from "../src/schema/person";
import { site } from "../src/schema/site";
import { template, templateVersion } from "../src/schema/template";
import { variable } from "../src/schema/variable";
import { TEST_DATABASE_URL } from "./connection";

export const testDb = drizzle(TEST_DATABASE_URL, { relations });

export const closeTestDb = () => testDb.$client.end();

/**
 * Awaits a statement that must be rejected by the database, and asserts
 * the postgres error code (and optionally the violated constraint).
 * Common codes: 23505 unique, 23503 foreign key (NO ACTION),
 * 23001 restrict, 23514 check.
 */
export async function expectDbError(promise: Promise<unknown>, code: string | string[], constraint?: string) {
	let caught: unknown;

	try {
		await promise;
	} catch (error) {
		caught = error;
	}

	expect(caught, "expected the statement to be rejected by the database").toBeDefined();

	// Drizzle wraps the postgres error, so walk the cause chain
	let cause: unknown = caught;
	while (cause instanceof Error && !(cause instanceof DatabaseError) && cause.cause) {
		cause = cause.cause;
	}

	expect(cause).toBeInstanceOf(DatabaseError);

	const dbError = cause as DatabaseError;
	expect(Array.isArray(code) ? code : [code]).toContain(dbError.code);

	if (constraint) {
		expect(dbError.constraint).toBe(constraint);
	}
}

export async function createOrgFixture() {
	const id = randomUUID();
	await testDb
		.insert(organization)
		.values({ id, name: `Test Org ${id.slice(0, 8)}`, slug: `org-${id}`, createdAt: new Date() });
	return id;
}

export async function createUserFixture() {
	const id = randomUUID();
	await testDb.insert(user).values({ id, name: "Test User", email: `${id}@test.local` });
	return id;
}

export async function createTeamFixture(organizationId: string) {
	const id = randomUUID();
	await testDb.insert(team).values({ id, name: "Test Team", organizationId, createdAt: new Date() });
	return id;
}

export async function createTeamMemberFixture(
	teamId: string,
	userId: string,
	role: "member" | "team_admin" = "member",
) {
	const id = randomUUID();
	await testDb.insert(teamMember).values({ id, teamId, userId, role });
	return id;
}

export async function createSiteFixture(organizationId: string, teamId: string) {
	const id = randomUUID();
	await testDb
		.insert(site)
		.values({ id, organizationId, teamId, identifier: `S-${id.slice(0, 8)}`, name: "Test Site" });
	return id;
}

export async function createPersonFixture(organizationId: string) {
	const id = randomUUID();
	await testDb.insert(person).values({ id, organizationId, name: "Test Person", email: `${id}@test.local` });
	return id;
}

export async function createFileFixture(organizationId: string) {
	const key = `${organizationId}/document/${randomUUID()}.pdf`;
	await testDb.insert(file).values({
		key,
		organizationId,
		uploadedAt: Temporal.Now.instant(),
		type: "document",
		sizeInBytes: 1024,
		name: "test.pdf",
		mimeType: "application/pdf",
	});
	return key;
}

export async function createVariableFixture(organizationId: string, nameKey?: string) {
	const id = randomUUID();
	await testDb.insert(variable).values({
		id,
		organizationId,
		nameKey: nameKey ?? `key_${id.replaceAll("-", "")}`,
		type: "text",
	});
	return id;
}

export async function createTemplateFixture(organizationId: string) {
	const id = randomUUID();
	await testDb.insert(template).values({ id, organizationId, name: "Test Template" });
	return id;
}

export async function createTemplateVersionFixture(
	templateId: string,
	publishedByUserId: string,
	version = 1,
	publishedAt: Temporal.Instant | null = Temporal.Now.instant(),
) {
	const id = randomUUID();
	await testDb.insert(templateVersion).values({ id, templateId, publishedByUserId, version, content: {}, publishedAt });
	return id;
}

/** An organization with a team, site, creator user, and one draft document. */
export async function createDocumentGraphFixture() {
	const organizationId = await createOrgFixture();
	const userId = await createUserFixture();
	const teamId = await createTeamFixture(organizationId);
	const siteId = await createSiteFixture(organizationId, teamId);

	const documentId = randomUUID();
	await testDb
		.insert(document)
		.values({ id: documentId, organizationId, teamId, siteId, createdByUserId: userId, name: "Test Document" });

	return { organizationId, userId, teamId, siteId, documentId };
}
