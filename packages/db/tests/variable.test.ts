import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { variableHasPublishedUse, variableHasPublishedUseSql } from "../src/helpers";
import { documentVariableInstance, templateVariableInstance, variable } from "../src/schema/variable";
import {
	closeTestDb,
	createDocumentGraphFixture,
	createOrgFixture,
	createTemplateFixture,
	createTemplateVersionFixture,
	createUserFixture,
	createVariableFixture,
	expectDbError,
	testDb,
} from "./test-db";

afterAll(() => closeTestDb());

describe("organization variables", () => {
	it("stores a variable with a supported type, scoped to an organization", async () => {
		const organizationId = await createOrgFixture();
		const id = await createVariableFixture(organizationId);

		const [row] = await testDb.select().from(variable).where(eq(variable.id, id));

		expect(row?.organizationId).toBe(organizationId);
		expect(row?.type).toBe("text");
	});

	it("rejects a duplicate key within the same organization", async () => {
		const organizationId = await createOrgFixture();
		await createVariableFixture(organizationId, "site_manager_name");

		await expectDbError(createVariableFixture(organizationId, "site_manager_name"), "23505");
	});

	it("allows the same key in different organizations", async () => {
		const orgA = await createOrgFixture();
		const orgB = await createOrgFixture();

		await createVariableFixture(orgA, "site_manager_name");
		await createVariableFixture(orgB, "site_manager_name");
	});
});

describe("variable freeze after published use", () => {
	it("reports no published use for an unused variable", async () => {
		const organizationId = await createOrgFixture();
		const variableId = await createVariableFixture(organizationId);

		expect(await variableHasPublishedUse(testDb, variableId)).toBe(false);
	});

	it("reports published use once a published template version uses the variable", async () => {
		const organizationId = await createOrgFixture();
		const userId = await createUserFixture();
		const variableId = await createVariableFixture(organizationId);
		const templateId = await createTemplateFixture(organizationId);
		const templateVersionId = await createTemplateVersionFixture(templateId, userId);

		await testDb.insert(templateVariableInstance).values({ variableId, templateVersionId });

		expect(await variableHasPublishedUse(testDb, variableId)).toBe(true);
	});

	it("flags hasPublishedUse per row via the shared exists expression (variable.list uses it)", async () => {
		const organizationId = await createOrgFixture();
		const userId = await createUserFixture();
		const usedVariableId = await createVariableFixture(organizationId);
		const unusedVariableId = await createVariableFixture(organizationId);
		const templateId = await createTemplateFixture(organizationId);
		const templateVersionId = await createTemplateVersionFixture(templateId, userId);

		await testDb.insert(templateVariableInstance).values({ variableId: usedVariableId, templateVersionId });

		const rows = await testDb
			.select({ id: variable.id, hasPublishedUse: variableHasPublishedUseSql })
			.from(variable)
			.where(eq(variable.organizationId, organizationId));

		const byId = new Map(rows.map((row) => [row.id, row.hasPublishedUse]));
		expect(byId.get(usedVariableId)).toBe(true);
		expect(byId.get(unusedVariableId)).toBe(false);
	});

	it("prevents deleting a variable used by a published template version", async () => {
		const organizationId = await createOrgFixture();
		const userId = await createUserFixture();
		const variableId = await createVariableFixture(organizationId);
		const templateId = await createTemplateFixture(organizationId);
		const templateVersionId = await createTemplateVersionFixture(templateId, userId);

		await testDb.insert(templateVariableInstance).values({ variableId, templateVersionId });

		await expectDbError(testDb.delete(variable).where(eq(variable.id, variableId)), "23503");
	});

	it("prevents deleting a variable that holds a document value", async () => {
		const { organizationId, documentId } = await createDocumentGraphFixture();
		const variableId = await createVariableFixture(organizationId);

		await testDb.insert(documentVariableInstance).values({ variableId, documentId, value: "Some value" });

		await expectDbError(testDb.delete(variable).where(eq(variable.id, variableId)), "23503");
	});

	it("allows deleting an unused variable", async () => {
		const organizationId = await createOrgFixture();
		const variableId = await createVariableFixture(organizationId);

		await testDb.delete(variable).where(eq(variable.id, variableId));

		const rows = await testDb.select().from(variable).where(eq(variable.id, variableId));
		expect(rows).toHaveLength(0);
	});
});
