import { randomUUID } from "node:crypto";
import { Temporal } from "@theshoregroup/time";
import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import {
	FILE_UPLOAD_REAP_GRACE,
	markFileUploadFailed,
	promoteFileToUploaded,
	selectFilesPendingReconciliation,
	selectServableFile,
} from "../src/helpers";
import { file } from "../src/schema/file";
import { closeTestDb, createOrgFixture, testDb } from "./test-db";

afterAll(() => closeTestDb());

async function createPendingContentFile(organizationId: string, createdAt?: Temporal.Instant) {
	const key = `${organizationId}/content/${randomUUID()}.png`;

	await testDb.insert(file).values({
		key,
		organizationId,
		type: "content",
		sizeInBytes: 1234,
		name: "test.png",
		mimeType: "image/png",
		...(createdAt ? { createdAt } : {}),
	});

	return key;
}

async function getFileRow(key: string) {
	const [row] = await testDb.select().from(file).where(eq(file.key, key));

	expect(row).toBeDefined();

	// biome-ignore lint/style/noNonNullAssertion: asserted above
	return row!;
}

describe("file upload lifecycle conditional writes", () => {
	it("derives upload_state from the timestamps", async () => {
		const organizationId = await createOrgFixture();
		const key = await createPendingContentFile(organizationId);

		expect((await getFileRow(key)).uploadState).toBe("pending");

		await promoteFileToUploaded(testDb, { key, sizeInBytes: 4321, at: Temporal.Now.instant() });

		const promoted = await getFileRow(key);
		expect(promoted.uploadState).toBe("uploaded");
		expect(promoted.sizeInBytes).toBe(4321);
	});

	it("promotes to uploaded even after a failure report (uploadedAt wins)", async () => {
		const organizationId = await createOrgFixture();
		const key = await createPendingContentFile(organizationId);

		expect(await markFileUploadFailed(testDb, { key, message: "network died", at: Temporal.Now.instant() })).toBe(true);
		expect((await getFileRow(key)).uploadState).toBe("failed");

		expect(await promoteFileToUploaded(testDb, { key, sizeInBytes: 4321, at: Temporal.Now.instant() })).toBe(true);

		const row = await getFileRow(key);
		expect(row.uploadState).toBe("uploaded");
		expect(row.uploadError).toBe("network died");
	});

	it("no-ops a second promote, keeping the first timestamp and size", async () => {
		const organizationId = await createOrgFixture();
		const key = await createPendingContentFile(organizationId);

		const firstAt = Temporal.Now.instant();
		expect(await promoteFileToUploaded(testDb, { key, sizeInBytes: 4321, at: firstAt })).toBe(true);

		const laterAt = firstAt.add(Temporal.Duration.from({ minutes: 5 }));
		expect(await promoteFileToUploaded(testDb, { key, sizeInBytes: 9999, at: laterAt })).toBe(false);

		const row = await getFileRow(key);
		expect(row.uploadedAt?.epochMilliseconds).toBe(firstAt.epochMilliseconds);
		expect(row.sizeInBytes).toBe(4321);
	});

	it("no-ops a failure report after a promote", async () => {
		const organizationId = await createOrgFixture();
		const key = await createPendingContentFile(organizationId);

		await promoteFileToUploaded(testDb, { key, sizeInBytes: 4321, at: Temporal.Now.instant() });

		expect(await markFileUploadFailed(testDb, { key, message: "too late", at: Temporal.Now.instant() })).toBe(false);

		const row = await getFileRow(key);
		expect(row.uploadState).toBe("uploaded");
		expect(row.erroredAt).toBeNull();
		expect(row.uploadError).toBeNull();
	});

	it("no-ops a second failure report", async () => {
		const organizationId = await createOrgFixture();
		const key = await createPendingContentFile(organizationId);

		expect(await markFileUploadFailed(testDb, { key, message: "first", at: Temporal.Now.instant() })).toBe(true);
		expect(await markFileUploadFailed(testDb, { key, message: "second", at: Temporal.Now.instant() })).toBe(false);

		expect((await getFileRow(key)).uploadError).toBe("first");
	});

	it("truncates the stored upload error", async () => {
		const organizationId = await createOrgFixture();
		const key = await createPendingContentFile(organizationId);

		await markFileUploadFailed(testDb, { key, message: "x".repeat(2000), at: Temporal.Now.instant() });

		expect((await getFileRow(key)).uploadError).toHaveLength(500);
	});
});

describe("servable file lookup (asset proxy authz)", () => {
	it("returns an uploaded row for its own org only", async () => {
		const organizationId = await createOrgFixture();
		const otherOrganizationId = await createOrgFixture();
		const key = await createPendingContentFile(organizationId);

		await promoteFileToUploaded(testDb, { key, sizeInBytes: 4321, at: Temporal.Now.instant() });

		const ownOrg = await selectServableFile(testDb, { organizationId, key });
		expect(ownOrg?.key).toBe(key);
		expect(ownOrg?.mimeType).toBe("image/png");

		const crossOrg = await selectServableFile(testDb, { organizationId: otherOrganizationId, key });
		expect(crossOrg).toBeUndefined();
	});

	it("never serves pending or failed rows", async () => {
		const organizationId = await createOrgFixture();

		const pendingKey = await createPendingContentFile(organizationId);
		expect(await selectServableFile(testDb, { organizationId, key: pendingKey })).toBeUndefined();

		const failedKey = await createPendingContentFile(organizationId);
		await markFileUploadFailed(testDb, { key: failedKey, message: "network died", at: Temporal.Now.instant() });
		expect(await selectServableFile(testDb, { organizationId, key: failedKey })).toBeUndefined();
	});
});

describe("sweep reconciliation selection", () => {
	it("picks only pending rows older than the grace period", async () => {
		const organizationId = await createOrgFixture();

		const now = Temporal.Now.instant();
		const beyondGrace = now.subtract(FILE_UPLOAD_REAP_GRACE).subtract(Temporal.Duration.from({ minutes: 15 }));

		const stalePending = await createPendingContentFile(organizationId, beyondGrace);
		const freshPending = await createPendingContentFile(organizationId);
		const staleUploaded = await createPendingContentFile(organizationId, beyondGrace);
		const staleFailed = await createPendingContentFile(organizationId, beyondGrace);

		await promoteFileToUploaded(testDb, { key: staleUploaded, sizeInBytes: 1, at: now });
		await markFileUploadFailed(testDb, { key: staleFailed, message: "client reported", at: now });

		const selected = await selectFilesPendingReconciliation(testDb, {
			olderThan: now.subtract(FILE_UPLOAD_REAP_GRACE),
			limit: 100,
		});
		const selectedKeys = selected.map((row) => row.key);

		expect(selectedKeys).toContain(stalePending);
		expect(selectedKeys).not.toContain(freshPending);
		expect(selectedKeys).not.toContain(staleUploaded);
		expect(selectedKeys).not.toContain(staleFailed);
	});

	it("respects the page-size limit, oldest first", async () => {
		const organizationId = await createOrgFixture();

		const now = Temporal.Now.instant();
		const oldest = now.subtract(Temporal.Duration.from({ hours: 3 }));
		const older = now.subtract(Temporal.Duration.from({ hours: 2 }));
		const old = now.subtract(Temporal.Duration.from({ hours: 1 }));

		const oldestKey = await createPendingContentFile(organizationId, oldest);
		const olderKey = await createPendingContentFile(organizationId, older);
		await createPendingContentFile(organizationId, old);

		const selected = await selectFilesPendingReconciliation(testDb, {
			olderThan: now.subtract(FILE_UPLOAD_REAP_GRACE),
			limit: 2,
		});

		// Other tests share the scratch db, so scope to this org's rows
		const orgKeys = selected.filter((row) => row.organizationId === organizationId).map((row) => row.key);

		expect(selected.length).toBe(2);
		expect(orgKeys.length).toBeLessThanOrEqual(2);

		if (orgKeys.length === 2) {
			expect(orgKeys).toEqual([oldestKey, olderKey]);
		}
	});
});
