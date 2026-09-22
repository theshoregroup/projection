// Vite plugin that runs the dialog-registry codegen.
//
// - `configResolved`: generate the registry once so imports resolve before
//   any module is loaded. Strict in build, lenient in dev.
// - `configureServer` (dev only): watch `*.dialog.tsx` files and regenerate
//   on add/change/delete. Vite picks up the resulting registry change via
//   its normal file-change pipeline; no manual HMR plumbing required.
//
// This file is intentionally Node-only and is imported from vite.config.ts.
// Do NOT import it from client code — it pulls in the TypeScript compiler.

import { resolve } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { generateRegistry } from "./codegen.ts";

export interface DialogRegistryPluginOptions {
	/** Directory scanned for `*.dialog.tsx` files. Default: `src/components`. */
	scanDir?: string;
	/** Output path for the generated registry. Default: `src/dialogTree.gen.ts`. */
	outPath?: string;
}

export function dialogRegistryPlugin(
	options: DialogRegistryPluginOptions = {},
): Plugin {
	let config: ResolvedConfig;
	let scanDir: string;
	let outPath: string;

	const regenerate = (label: string, strict: boolean) => {
		try {
			const { entries, changed, warnings } = generateRegistry({
				scanDir,
				outPath,
				strict,
			});
			for (const w of warnings) config.logger.warn(`[dialogs] ${w}`);
			if (changed) {
				config.logger.info(
					`[dialogs] ${label}: regenerated ${entries.length} dialog(s)`,
				);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			// In dev we still surface as error but don't kill the process — Vite's
			// logger handles display. In build, throw to fail the build loudly.
			if (strict) throw err;
			config.logger.error(`[dialogs] codegen failed: ${msg}`);
		}
	};

	return {
		name: "dialog-registry",
		enforce: "pre",

		configResolved(resolved) {
			config = resolved;
			scanDir = resolve(config.root, options.scanDir ?? "src/components");
			outPath = resolve(
				config.root,
				options.outPath ?? "src/dialogTree.gen.ts",
			);
			const isBuild = config.command === "build";
			regenerate("startup", isBuild);
		},

		configureServer(server) {
			const onEvent = (event: string) => (path: string) => {
				if (!path.endsWith(".dialog.tsx")) return;
				regenerate(`${event}: ${path}`, false);
			};
			server.watcher.on("change", onEvent("change"));
			server.watcher.on("add", onEvent("add"));
			server.watcher.on("unlink", onEvent("unlink"));
		},
	};
}
