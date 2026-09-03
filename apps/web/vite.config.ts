import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import "@projection/env/server";

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
		alias: { tslib: "tslib/tslib.es6.mjs" },
	},
	plugins: [tailwindcss(), tanstackStart(), nitro(), viteReact()],
	// Bundle all SSR deps into the server build: deployed Vercel functions
	// have no node_modules at runtime. Build-only — in dev the SSR module
	// runner can't inline CJS deps like react ("module is not defined").
	ssr: command === "build" ? { noExternal: true } : {},
}));
