import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { ADMIN_DATABASE_URL, TEST_DATABASE_NAME, TEST_DATABASE_URL } from "./connection";

/**
 * Recreates the scratch database and pushes the current schema into it,
 * so every test run starts from exactly what `src/schema` declares.
 * Requires the dev postgres container (`pnpm img up -d`) to be running.
 */
export default async function setup() {
	const admin = new Client({ connectionString: ADMIN_DATABASE_URL });

	try {
		await admin.connect();
	} catch (error) {
		throw new Error(
			`Could not reach the dev postgres container at ${ADMIN_DATABASE_URL}. Start it with \`pnpm img up -d\` in packages/db.`,
			{ cause: error },
		);
	}

	await admin.query(`DROP DATABASE IF EXISTS ${TEST_DATABASE_NAME}`);
	await admin.query(`CREATE DATABASE ${TEST_DATABASE_NAME}`);
	await admin.end();

	const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

	execSync("pnpm drizzle-kit push --force", {
		cwd: packageRoot,
		env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
		stdio: "pipe",
	});
}
