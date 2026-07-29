import { eq, sql } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { auditLog } from "../src/schema/audit";
import { organization, user } from "../src/schema/auth";
import { document } from "../src/schema/document";
import { closeTestDb, createDocumentGraphFixture, createUserFixture, expectDbError, testDb } from "./test-db";

afterAll(() => closeTestDb());

describe("audit trail actor typing", () => {
	it("accepts each actor type with its matching reference", async () => {
		const { organizationId, documentId } = await createDocumentGraphFixture();
		const actorUserId = await createUserFixture();

		await testDb.insert(auditLog).values([
			{ organizationId, documentId, actorType: "user", actorUserId, action: "document.create" },
			{ organizationId, documentId, actorType: "system", action: "document.complete" },
		]);

		const rows = await testDb.select().from(auditLog).where(eq(auditLog.documentId, documentId));
		expect(rows).toHaveLength(2);
	});

	it("rejects actor references that do not match the actor type", async () => {
		const { organizationId, documentId } = await createDocumentGraphFixture();
		const actorUserId = await createUserFixture();

		await expectDbError(
			testDb
				.insert(auditLog)
				.values({ organizationId, documentId, actorType: "system", actorUserId, action: "document.approve" }),
			"23514",
			"audit_log_actor_matches_type",
		);
	});
});

describe("audit trail append-only behaviour", () => {
	it("rejects client-supplied event ids", async () => {
		const { organizationId, documentId } = await createDocumentGraphFixture();

		await expectDbError(
			testDb.execute(
				sql`INSERT INTO audit_log (id, organization_id, document_id, actor_type, action) VALUES (999, ${organizationId}, ${documentId}, 'system', 'document.view')`,
			),
			"428C9",
		);
	});

	it("prevents deleting a document that has an audit trail", async () => {
		const { organizationId, documentId } = await createDocumentGraphFixture();

		await testDb
			.insert(auditLog)
			.values({ organizationId, documentId, actorType: "system", action: "document.create" });

		await expectDbError(testDb.delete(document).where(eq(document.id, documentId)), "23503");
	});

	it("anonymises history instead of erasing it when a user is removed", async () => {
		const { organizationId, documentId } = await createDocumentGraphFixture();
		const actorUserId = await createUserFixture();

		await testDb
			.insert(auditLog)
			.values({ organizationId, documentId, actorType: "user", actorUserId, action: "document.create" });

		await testDb.delete(user).where(eq(user.id, actorUserId));

		const [row] = await testDb.select().from(auditLog).where(eq(auditLog.documentId, documentId));
		expect(row?.actorType).toBe("user");
		expect(row?.actorUserId).toBeNull();
	});

	it("only loses the trail when the whole organization is deleted", async () => {
		const { organizationId, documentId } = await createDocumentGraphFixture();

		await testDb
			.insert(auditLog)
			.values({ organizationId, documentId, actorType: "system", action: "document.create" });

		await testDb.delete(organization).where(eq(organization.id, organizationId));

		const rows = await testDb.select().from(auditLog).where(eq(auditLog.organizationId, organizationId));
		expect(rows).toHaveLength(0);
	});
});
