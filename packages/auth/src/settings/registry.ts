import { defineRegistry } from "@theshoregroup/settings-better-auth-plugin/server";
import { z } from "zod/v4";

export const registry = defineRegistry({
	show_org_logo_on_exports: {
		categories: ["org"],
		default: false,
		schema: z.boolean(),
		meta: {
			name: "Show Organization Logo on Project Exports",
			description: "Displays the organization logo on project exports.",
		},
	},
});
