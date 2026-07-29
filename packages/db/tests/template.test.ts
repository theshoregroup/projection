import { Temporal } from "@theshoregroup/time";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { documentTemplateUsage, template } from "../src/schema/template";
import { templateVariableInstance } from "../src/schema/variable";
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

describe("template versions", () => {
	it("allows one published version and one pending version of one template", async () => {
		const organizationId = await createOrgFixture();
		const userId = await createUserFixture();
		const templateId = await createTemplateFixture(organizationId);

		await createTemplateVersionFixture(templateId, userId, 1, Temporal.Now.instant());
		await createTemplateVersionFixture(templateId, userId, 2, null);
	});

	it("rejects two versions with the same number for one template", async () => {
		const organizationId = await createOrgFixture();
		const userId = await createUserFixture();
		const templateId = await createTemplateFixture(organizationId);

		await createTemplateVersionFixture(templateId, userId, 1);

		await expectDbError(createTemplateVersionFixture(templateId, userId, 1), "23505");
	});

	it("allows the same version number across different templates", async () => {
		const organizationId = await createOrgFixture();
		const userId = await createUserFixture();
		const templateA = await createTemplateFixture(organizationId);
		const templateB = await createTemplateFixture(organizationId);

		await createTemplateVersionFixture(templateA, userId, 1);
		await createTemplateVersionFixture(templateB, userId, 1);
	});

	it("prevents deleting a template that has published versions", async () => {
		const organizationId = await createOrgFixture();
		const userId = await createUserFixture();
		const templateId = await createTemplateFixture(organizationId);

		await createTemplateVersionFixture(templateId, userId, 1);

		// Older postgres reports RESTRICT as 23503; postgres 18+ as 23001
		await expectDbError(testDb.delete(template).where(eq(template.id, templateId)), ["23001", "23503"]);
	});
});

describe("materialized template variable uses", () => {
	it("carries the required flag per variable, defaulting to false", async () => {
		const organizationId = await createOrgFixture();
		const userId = await createUserFixture();
		const templateId = await createTemplateFixture(organizationId);
		const templateVersionId = await createTemplateVersionFixture(templateId, userId);
		const requiredVariableId = await createVariableFixture(organizationId);
		const optionalVariableId = await createVariableFixture(organizationId);
		const defaultedVariableId = await createVariableFixture(organizationId);

		await testDb.insert(templateVariableInstance).values([
			{ variableId: requiredVariableId, templateVersionId, required: true },
			{ variableId: optionalVariableId, templateVersionId, required: false },
			{ variableId: defaultedVariableId, templateVersionId },
		]);

		const rows = await testDb
			.select()
			.from(templateVariableInstance)
			.where(eq(templateVariableInstance.templateVersionId, templateVersionId));

		const requiredById = new Map(rows.map((row) => [row.variableId, row.required]));
		expect(requiredById.get(requiredVariableId)).toBe(true);
		expect(requiredById.get(optionalVariableId)).toBe(false);
		expect(requiredById.get(defaultedVariableId)).toBe(false);
	});

	it("rejects the same variable twice for one template version", async () => {
		const organizationId = await createOrgFixture();
		const userId = await createUserFixture();
		const templateId = await createTemplateFixture(organizationId);
		const templateVersionId = await createTemplateVersionFixture(templateId, userId);
		const variableId = await createVariableFixture(organizationId);

		await testDb.insert(templateVariableInstance).values({ variableId, templateVersionId, required: true });

		await expectDbError(
			testDb.insert(templateVariableInstance).values({ variableId, templateVersionId, required: false }),
			"23505",
		);
	});
});

describe("ordered template versions on a document", () => {
	it("orders versions by position and allows multiple versions", async () => {
		const { organizationId, userId, documentId } = await createDocumentGraphFixture();
		const templateId = await createTemplateFixture(organizationId);
		const versionA = await createTemplateVersionFixture(templateId, userId, 1);
		const versionB = await createTemplateVersionFixture(templateId, userId, 2, null);

		await testDb.insert(documentTemplateUsage).values([
			{ documentId, templateVersionId: versionA, position: 0 },
			{ documentId, templateVersionId: versionB, position: 1 },
		]);
	});

	it("rejects two versions at the same position in one document", async () => {
		const { organizationId, userId, documentId } = await createDocumentGraphFixture();
		const templateId = await createTemplateFixture(organizationId);
		const versionA = await createTemplateVersionFixture(templateId, userId, 1);
		const versionB = await createTemplateVersionFixture(templateId, userId, 2, null);

		await testDb.insert(documentTemplateUsage).values({ documentId, templateVersionId: versionA, position: 0 });

		await expectDbError(
			testDb.insert(documentTemplateUsage).values({ documentId, templateVersionId: versionB, position: 0 }),
			"23505",
		);
	});

	it("rejects the same version twice in one document", async () => {
		const { organizationId, userId, documentId } = await createDocumentGraphFixture();
		const templateId = await createTemplateFixture(organizationId);
		const versionA = await createTemplateVersionFixture(templateId, userId, 1);

		await testDb.insert(documentTemplateUsage).values({ documentId, templateVersionId: versionA, position: 0 });

		await expectDbError(
			testDb.insert(documentTemplateUsage).values({ documentId, templateVersionId: versionA, position: 1 }),
			"23505",
		);
	});
});
