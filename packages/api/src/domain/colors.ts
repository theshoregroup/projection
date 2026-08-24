// Bars are colored by a deterministic hash of the Assignee string — no color
// column, no pickers; same person always renders the same color (CONTEXT.md).

const PALETTE = [
	"#38bdf8", // sky
	"#a78bfa", // violet
	"#34d399", // emerald
	"#fbbf24", // amber
	"#f472b6", // pink
	"#fb7185", // rose
	"#4ade80", // green
	"#fb923c", // orange
	"#22d3ee", // cyan
	"#e879f9", // fuchsia
	"#a3e635", // lime
	"#818cf8", // indigo
];

const UNASSIGNED_COLOR = "#6b7280"; // gray-500

export function assigneeColor(assignee: string | null | undefined): string {
	if (!assignee?.trim()) return UNASSIGNED_COLOR;
	const normalized = assignee.trim().toLowerCase();
	let hash = 0;
	for (let i = 0; i < normalized.length; i++) {
		hash = (hash * 31 + normalized.charCodeAt(i)) >>> 0;
	}
	return PALETTE[hash % PALETTE.length] ?? UNASSIGNED_COLOR;
}
