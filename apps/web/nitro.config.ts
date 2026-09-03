import evlog from "evlog/nitro/v3";
import { defineConfig } from "nitro";

export default defineConfig({
	experimental: {
		asyncContext: true,
	},
	modules: [
		evlog({
			env: { service: "projection-web" },
		}),
	],
	// sharp uses native binaries that can't be bundled into the server build;
	// Nitro must resolve it at runtime from node_modules so Vercel's
	// serverless runtime can load the platform-specific .node addon.
	rollupConfig: {
		external: ["sharp"],
	},
});
