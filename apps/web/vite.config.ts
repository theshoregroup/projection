import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import devtoolsJson from "vite-plugin-devtools-json";
import "@projection/env/server";
import { dialogRegistryPlugin } from "./src/utils/dialogs/vite-plugin/index";

export default defineConfig(({ command }) => ({
	server: {
		port: 3001,
	},
	resolve: {
		tsconfigPaths: true,
		// Force tslib to its ESM entry: rolldown mis-wraps tslib's CJS build
		// (tslib.js) when code-split into the SSR router chunk, producing
		// `__toESM(__commonJSMin(factory)).default` where the lazy factory is
		// never invoked — crashing the whole bundle at import time.
		// The .js (not .mjs) entry: both tslib majors ship it, while only v2
		// ships .mjs — pdf-lib pins tslib@1.
		alias: { tslib: "tslib/tslib.es6.js" },
	},
	plugins: [
		devtoolsJson({
			projectRoot: "/apps/web",
			uuid: "8e29a4bf-a78a-4a9a-97d4-59c0d4e92e30",
		}),
		dialogRegistryPlugin(),
		tailwindcss(),
		tanstackStart(),
		nitro(),
		viteReact(),
	],
	// Bundle all SSR deps into the server build: deployed Vercel functions
	// have no node_modules at runtime. Build-only — in dev the SSR module
	// runner can't inline CJS deps like react ("module is not defined").
	ssr: command === "build" ? { noExternal: true } : {},
}));
