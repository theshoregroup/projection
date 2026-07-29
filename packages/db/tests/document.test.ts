import { Temporal } from "@theshoregroup/time";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { document } from "../src/schema/document";
import { documentTemplateUsage } from "../src/schema/template";
import { documentVariableInstance, variable } from "../src/schema/variable";
import {
	closeTestDb,
	createDocumentGraphFixture,
	createFileFixture,
	createPersonFixture,
	createTemplateFixture,
	createTemplateVersionFixture,
	expectDbError,
	testDb,
} from "./test-db";

afterAll(() => closeTestDb());

describe("document lifecycle state", () => {
	it("accepts a draft without a PDF file", async () => {
		const { documentId } = await createDocumentGraphFixture();

		const [row] = await testDb.select().from(document).where(eq(document.id, documentId));

		expect(row?.status).toBe("draft");
		expect(row?.fileId).toBeNull();
	});

	it("rejects approved without a PDF file", async () => {
		const { documentId, userId } = await createDocumentGraphFixture();

		await expectDbError(
			testDb
				.update(document)
				.set({ status: "approved", approvedAt: Temporal.Now.instant(), approvedByUserId: userId })
				.where(eq(document.id, documentId)),
			"23514",
			"file_is_present_when_locked",
		);
	});

	it("accepts an approved document once a PDF file is attached", async () => {
		const { documentId, organizationId, userId } = await createDocumentGraphFixture();
		const fileId = await createFileFixture(organizationId);

		await testDb
			.update(document)
			.set({ status: "approved", approvedAt: Temporal.Now.instant(), approvedByUserId: userId, fileId })
			.where(eq(document.id, documentId));

		const [row] = await testDb.select().from(document).where(eq(document.id, documentId));
		expect(row?.status).toBe("approved");
		expect(row?.approvedByUserId).toBe(userId);
	});

	it("rejects approved status without approver and timestamp", async () => {
		const { documentId } = await createDocumentGraphFixture();

		await expectDbError(
			testDb.update(document).set({ status: "approved" }).where(eq(document.id, documentId)),
			"23514",
			"approved_metadata_present_when_approved",
		);
	});

	it("rejects rejection without a reason and timestamp", async () => {
		const { documentId } = await createDocumentGraphFixture();

		await expectDbError(
			testDb.update(document).set({ status: "rejected" }).where(eq(document.id, documentId)),
			"23514",
			"rejected_metadata_present_when_rejected",
		);
	});

	it("accepts a rejected document with full rejection metadata", async () => {
		const { documentId } = await createDocumentGraphFixture();

		await testDb
			.update(document)
			.set({
				status: "rejected",
				rejectedAt: Temporal.Now.instant(),
				rejectedReason: "Needs corrections",
			})
			.where(eq(document.id, documentId));

		const [row] = await testDb.select().from(document).where(eq(document.id, documentId));
		expect(row?.status).toBe("rejected");
	});
});

describe("document references", () => {
	it("references one team, one creator, optional site, ordered versions and variable values", async () => {
		const { documentId, organizationId, userId, teamId, siteId } = await createDocumentGraphFixture();
		const fileId = await createFileFixture(organizationId);
		const templateId = await createTemplateFixture(organizationId);
		const versionA = await createTemplateVersionFixture(templateId, userId, 1);
		const versionB = await createTemplateVersionFixture(templateId, userId, 2, null);
		await createPersonFixture(organizationId);

		const variableId = crypto.randomUUID();
		await testDb.insert(variable).values({ id: variableId, organizationId, nameKey: "project_name", type: "text" });

		await testDb.insert(documentTemplateUsage).values([
			{ documentId, templateVersionId: versionA, position: 0 },
			{ documentId, templateVersionId: versionB, position: 1 },
		]);
		await testDb.insert(documentVariableInstance).values({ variableId, documentId, value: "Riverside Project" });
		await testDb
			.update(document)
			.set({ status: "approved", approvedAt: Temporal.Now.instant(), approvedByUserId: userId, fileId })
			.where(eq(document.id, documentId));

		const [row] = await testDb.select().from(document).where(eq(document.id, documentId));
		expect(row?.teamId).toBe(teamId);
		expect(row?.siteId).toBe(siteId);
		expect(row?.approvedByUserId).toBe(userId);

		const usages = await testDb
			.select()
			.from(documentTemplateUsage)
			.where(eq(documentTemplateUsage.documentId, documentId));
		expect(usages.map((u) => u.position).sort()).toEqual([0, 1]);

		const values = await testDb
			.select()
			.from(documentVariableInstance)
			.where(eq(documentVariableInstance.documentId, documentId));
		expect(values).toHaveLength(1);
	});
});
