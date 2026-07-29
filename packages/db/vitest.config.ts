import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["tests/**/*.test.ts"],
		globalSetup: "./tests/global-setup.ts",
		// Tests share one scratch database, so files run one at a time.
		fileParallelism: false,
	},
});
