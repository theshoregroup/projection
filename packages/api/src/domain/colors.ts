// Bars are colored by a deterministic hash of the Assignee string — no color
// column, no pickers; same person always renders the same colour within the
// project's chosen palette. The palette is 36 mid-tone steps (three per hue
// family) so collisions are rare on real projects, every colour reads on white
// paper, and white note text stays legible on the bars.

import {
	DEFAULT_PALETTE_ID,
	getPalette,
	type Palette,
	UNASSIGNED_COLOR,
} from "@projection/db/palettes";

export { UNASSIGNED_COLOR } from "@projection/db/palettes";
export type { Palette };

export function assigneeColor(
	assignee: string | null | undefined,
	paletteId: string = DEFAULT_PALETTE_ID,
): string {
	if (!assignee?.trim()) return UNASSIGNED_COLOR;
	const palette = getPalette(paletteId);
	const normalized = assignee.trim().toLowerCase();
	let hash = 0;
	for (let i = 0; i < normalized.length; i++) {
		hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
	}
	return palette.colors[hash % palette.colors.length] ?? UNASSIGNED_COLOR;
}
