import { z } from "zod";

/**
 * Build the root-level validator from the codegened schema record (see
 * `dialogTree.gen.ts`). The record's keys are the known `dialogKey` literals
 * and the values are the corresponding zod schemas.
 *
 * Behavior:
 * - No `dialogKey` in the URL → returns empty dialog state.
 * - `dialogKey` matches the registry AND its schema parses → returns the typed object.
 * - `dialogKey` is unknown:
 *     - Dev: warn + strip. Prevents stale URLs from crashing the dev loop.
 *     - Prod (build): throw. A dialog requested in the URL but missing from
 *       the registry is a real bug — surface it instead of degrading silently.
 * - `dialogKey` matches but the rest of the schema fails (e.g. invalid `dialogId`)
 *   → throws in all modes. That's the loud-error property of the URL-driven model.
 */
export function composeFromRegistry(schemas: Record<string, z.ZodType>) {
	const knownKeys = new Set(Object.keys(schemas));
	const list = Object.values(schemas) as [z.ZodType, ...z.ZodType[]];
	const union = list.length > 0 ? z.discriminatedUnion("dialogKey", list as never) : null;
	const emptyState = { dialogKey: undefined, dialogId: undefined, dialogPage: undefined } as const;

	return function validateDialogSearch(input: unknown) {
		const obj = (input ?? {}) as Record<string, unknown>;
		const incomingKey = obj.dialogKey;

		if (incomingKey === undefined || incomingKey === null || union === null) {
			return emptyState;
		}

		if (typeof incomingKey !== "string" || !knownKeys.has(incomingKey)) {
			if (import.meta.env.DEV) {
				console.warn(
					`[dialogs] URL has dialogKey="${String(incomingKey)}" but no matching dialog is registered. ` +
						`Stripping in dev so the page keeps rendering — this would throw in a production build.`,
				);
				return emptyState;
			}
			throw new Error(`Unknown dialogKey "${String(incomingKey)}" in URL — no dialog is registered for this key.`);
		}

		return union.parse(obj);
	};
}

export type DialogSearchState =
	| { dialogKey: undefined; dialogId: undefined; dialogPage: undefined }
	| { dialogKey: string; dialogId?: unknown; dialogPage?: unknown };
