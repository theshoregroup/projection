import { defineConfig } from "@trigger.dev/sdk";
import dotenv from "dotenv";

dotenv.config({
	path: "../../apps/web/.env",
});

export default defineConfig({
	// biome-ignore lint/style/noNonNullAssertion: better than importing all of the env during build.
	project: process.env.TRIGGER_PROJECT_ID!,
	runtime: "node-22",
	dirs: ["./src/tasks"],
	retries: {
		enabledInDev: true,
		default: {
			maxAttempts: 3,
			minTimeoutInMs: 1000,
			maxTimeoutInMs: 10000,
			factor: 2,
			randomize: true,
		},
	},
	maxDuration: 3600,
	build: {
		external: ["pg"],
	},
});
