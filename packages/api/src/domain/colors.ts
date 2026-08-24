// Bars are colored by a deterministic hash of the Assignee string — no color
// column, no pickers; same person always renders the same color (CONTEXT.md).
// The palette is 36 mid-tone steps (three per hue family) so collisions are
// rare on real projects, every color reads on white paper, and white note
// text stays legible on the bars.

const PALETTE = [
	// sky
	"#0ea5e9",
	"#38bdf8",
	"#0369a1",
	// cyan
	"#06b6d4",
	"#22d3ee",
	"#0e7490",
	// emerald
	"#10b981",
	"#34d399",
	"#047857",
	// green
	"#22c55e",
	"#4ade80",
	"#15803d",
	// lime
	"#84cc16",
	"#a3e635",
	"#4d7c0f",
	// amber
	"#f59e0b",
	"#fbbf24",
	"#b45309",
	// orange
	"#f97316",
	"#fb923c",
	"#c2410c",
	// rose
	"#f43f5e",
	"#fb7185",
	"#be123c",
	// pink
	"#ec4899",
	"#f472b6",
	"#be185d",
	// fuchsia
	"#d946ef",
	"#e879f9",
	"#a21caf",
	// violet
	"#8b5cf6",
	"#a78bfa",
	"#6d28d9",
	// indigo
	"#6366f1",
	"#818cf8",
	"#4338ca",
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
