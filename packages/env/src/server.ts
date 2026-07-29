import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

const skipValidation =
	!!process.env.SKIP_ALL_ENV_VALIDATION ||
	!!process.env.SKIP_SERVER_ENV_VALIDATION;
const dummyEnv = !!process.env.DUMMY_ENV;

if (skipValidation) {
	console.warn(
		"[env-server]: ⚠️ Skipping server environment variable validation. This is not recommended for production environments.",
	);
}

if (dummyEnv) {
	if (!skipValidation) {
		throw new Error("Using Dummy Env vars Requires SKIP ENV be enabled");
	}

	console.warn(
		"[env-server]: ⚠️ Using a dummy server env. This is for scripts and migrations only and provides no access to any resource",
	);

	const toSet: typeof env = {
		DATABASE_URL: "postgresql://real:db@1234",
		NODE_ENV: "development",
		RESEND_API_KEY: "re_282982938239",
		BETTER_AUTH_URL: "http://localhost:3000",
		CORS_ORIGIN: "http://localhost:3000",
		BETTER_AUTH_SECRET: "some-random-secret",
		AZURE_CLIENT_ID: "dummy-azure-client-id",
		AZURE_CLIENT_SECRET: "dummy-azure-client-secret",
		AZURE_TENANT_ID: "dummy-azure-tenant-id",
		ADMIN_EMAILS: "admin@example.com",
		TRIGGER_PROJECT_ID: "trdev_29392u3",
		TRIGGER_SECRET_KEY: "some-random-secret-dowijndnaufheufhejnfuisefuhef",
	};

	process.env = { ...process.env, ...toSet };
}

function getVercelOrigin() {
	const vercelUrl =
		process.env.VERCEL_ENV === "production"
			? (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)
			: (process.env.VERCEL_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL);
	if (!vercelUrl) return undefined;
	return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
}

const vercelOrigin = getVercelOrigin();

const runtimeEnv = {
	...process.env,
	BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? vercelOrigin,
	CORS_ORIGIN: process.env.CORS_ORIGIN ?? vercelOrigin,
};

export const env = createEnv({
	server: {
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		DATABASE_URL: z.string().startsWith("postgresql://"),
		RESEND_API_KEY: z.string().startsWith("re_"),
		AZURE_CLIENT_ID: z.string().min(1),
		AZURE_CLIENT_SECRET: z.string().min(1),
		AZURE_TENANT_ID: z.string().min(1),
		// Comma-separated emails granted the admin role at sign-in (ADR 0004)
		ADMIN_EMAILS: z.string().min(1),
		TRIGGER_PROJECT_ID: z.string(),
		TRIGGER_SECRET_KEY: z.string(),
	},
	runtimeEnv: runtimeEnv,
	skipValidation,
	emptyStringAsUndefined: true,
});
