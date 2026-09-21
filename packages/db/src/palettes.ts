// Colour palettes for Board bar rendering (CONTEXT.md — Board).
// Each palette has 36 mid-tone colour steps (three per hue family) so the
// deterministic hash in assigneeColor() keeps collision probability ~2.8 %.
// Accessible palettes are drawn from CB-safe base sets (Wong, Okabe–Ito, IBM)
// and expanded to 36 with luminance variants.

export interface Palette {
	/** Machine key, also stored in the project row. */
	id: string;
	/** Human-readable name for menus and table columns. */
	label: string;
	/** True for palettes designed for colour-blind accessibility. */
	accessible: boolean;
	/** 36 hex colours used by assigneeColor(hash). */
	colors: string[];
}

// ---------------------------------------------------------------------------
// Catppuccin Mocha — warm pastels, Rosé Pine–inspired
// ---------------------------------------------------------------------------

const catppuccin: Palette = {
	id: "catppuccin",
	label: "Catppuccin Mocha",
	accessible: false,
	colors: [
		// rosewater
		"#f5c2e7",
		"#d4a0c0",
		"#b07aa0",
		// flamingo
		"#f2b5cf",
		"#d08faa",
		"#ac6a88",
		// pink
		"#f5c2e7",
		"#e0a0d0",
		"#c07ab8",
		// mauve
		"#cba6f7",
		"#a87ed4",
		"#8658b2",
		// red
		"#f38ba8",
		"#d4657f",
		"#b04060",
		// maroon
		"#eba0ac",
		"#cc7a88",
		"#aa5668",
		// peach
		"#fab387",
		"#dd8a60",
		"#be6540",
		// yellow
		"#f9e2af",
		"#ddc080",
		"#b89a58",
		// green
		"#a6e3a1",
		"#80c47c",
		"#5da05a",
		// teal
		"#94e2d5",
		"#6cbfb2",
		"#4a9c90",
		// sky
		"#89dceb",
		"#64b4cc",
		"#408eaa",
		// sapphire
		"#74c7ec",
		"#52a1cb",
		"#337daa",
		// blue
		"#89b4fa",
		"#6c8ed4",
		"#4f6aae",
		// lavender
		"#b4befe",
		"#8e98d4",
		"#6a74aa",
	],
};

// ---------------------------------------------------------------------------
// Dracula — vivid dark-theme classics
// ---------------------------------------------------------------------------

const dracula: Palette = {
	id: "dracula",
	label: "Dracula",
	accessible: false,
	colors: [
		// cyan
		"#8be9fd",
		"#6ac2d8",
		"#4a9cb2",
		// green
		"#50fa7b",
		"#38d460",
		"#22a848",
		// yellow
		"#f1fa8c",
		"#d0d46a",
		"#a8b048",
		// orange
		"#ffb86c",
		"#dc9448",
		"#b87030",
		// pink
		"#ff79c6",
		"#d45aa4",
		"#aa3c82",
		// purple
		"#bd93f9",
		"#9a70d4",
		"#784eae",
		// red
		"#ff5555",
		"#d43838",
		"#aa2020",
		// chartreuse
		"#a6e22e",
		"#84be18",
		"#669a10",
		// teal
		"#1abc9c",
		"#14967c",
		"#107060",
		// aqua
		"#66d9ef",
		"#48b2cc",
		"#3088a6",
		// indigo
		"#6272a4",
		"#4c5a82",
		"#384462",
		// lavender
		"#c0a8f0",
		"#9c84cc",
		"#7a62a8",
		// gold
		"#f5c542",
		"#d0a030",
		"#aa7e20",
	],
};

// ---------------------------------------------------------------------------
// Nord — cool, muted blues and greens
// ---------------------------------------------------------------------------

const nord: Palette = {
	id: "nord",
	label: "Nord",
	accessible: false,
	colors: [
		// frost: blue
		"#81a1c1",
		"#6690aa",
		"#4c7f93",
		// frost: cyan
		"#88c0d0",
		"#6ca8b8",
		"#5090a0",
		// frost: teal
		"#8fbcbb",
		"#74a0a0",
		"#5a8486",
		// frost: purple
		"#b48ead",
		"#987296",
		"#7c587f",
		// aurora: red
		"#bf616a",
		"#a04850",
		"#823238",
		// aurora: orange
		"#d08770",
		"#b06c58",
		"#905240",
		// aurora: yellow
		"#ebcb8b",
		"#ccaa68",
		"#ac8a48",
		// aurora: green
		"#a3be8c",
		"#86a070",
		"#6a8256",
		// polar: snow
		"#d8dee9",
		"#b0b8c8",
		"#8898a8",
		// polar: frost-light
		"#e5e9f0",
		"#c0c8d4",
		"#9aa8b8",
		// frost: deeper blue
		"#5e81ac",
		"#486888",
		"#345066",
		// frost: slate
		"#4c566a",
		"#3c4456",
		"#2e3440",
		// aurora: warm green
		"#a3be8c",
		"#8faa76",
		"#729660",
	],
};

// ---------------------------------------------------------------------------
// Solarized — warm/cool measured lab values
// ---------------------------------------------------------------------------

const solarized: Palette = {
	id: "solarized",
	label: "Solarized",
	accessible: false,
	colors: [
		// blue
		"#268bd2",
		"#4e9ccc",
		"#1a6da0",
		// cyan
		"#2aa198",
		"#48b8b0",
		"#1e8a82",
		// green
		"#859900",
		"#a0b840",
		"#6c7e00",
		// yellow
		"#b58900",
		"#cca430",
		"#9a7000",
		// orange
		"#cb4b16",
		"#dc6838",
		"#aa3a10",
		// red
		"#dc322f",
		"#e85858",
		"#b02020",
		// magenta
		"#d33682",
		"#e05aa0",
		"#b02068",
		// violet
		"#6c71c4",
		"#8c90d8",
		"#5054a0",
		// base-blue accent
		"#268bd2",
		"#4098d8",
		"#1a70a8",
		// base-cyan accent
		"#2aa198",
		"#44b4a8",
		"#1e8878",
		// base-green accent
		"#859900",
		"#a0b440",
		"#6c7c00",
		// solarized warm
		"#b58900",
		"#cca030",
		"#9a7200",
		// solarized cool
		"#268bd2",
		"#4e98d0",
		"#1a6ca0",
		// solarized mid
		"#d33682",
		"#e058a0",
		"#b02468",
	],
};

// ---------------------------------------------------------------------------
// Wong (2011) — colour-blind–safe base, expanded to 36
// ---------------------------------------------------------------------------

const wong: Palette = {
	id: "wong",
	label: "Wong (CB-safe)",
	accessible: true,
	colors: [
		// black-ish
		"#000000",
		"#444444",
		"#777777",
		// orange
		"#e69f00",
		"#cc8a00",
		"#aa7200",
		// sky blue
		"#56b4e9",
		"#3c9ad0",
		"#287aaa",
		// bluish green
		"#009e73",
		"#008060",
		"#006248",
		// yellow
		"#f0e442",
		"#d4ca38",
		"#b0a828",
		// blue
		"#0072b2",
		"#285a90",
		"#104468",
		// vermilion
		"#d55e00",
		"#aa4a00",
		"#803800",
		// reddish purple
		"#cc79a7",
		"#a85888",
		"#863a6a",
		// light orange
		"#e69f00",
		"#f0b840",
		"#c48800",
		// light sky blue
		"#56b4e9",
		"#80cae8",
		"#38a0cc",
		// light green
		"#009e73",
		"#30c094",
		"#008060",
		// light yellow
		"#f0e442",
		"#f8ee80",
		"#d4ca38",
		// light blue
		"#0072b2",
		"#4098d0",
		"#005a90",
		// light vermilion
		"#d55e00",
		"#e88040",
		"#b04800",
		// light reddish purple
		"#cc79a7",
		"#dd98c0",
		"#aa5888",
	],
};

// ---------------------------------------------------------------------------
// Okabe–Ito — colour-blind–safe base, expanded to 36
// ---------------------------------------------------------------------------

const okabeIto: Palette = {
	id: "okabe-ito",
	label: "Okabe–Ito (CB-safe)",
	accessible: true,
	colors: [
		// orange
		"#e69f00",
		"#cc8a00",
		"#aa7200",
		// sky blue
		"#56b4e9",
		"#3c9ad0",
		"#287aaa",
		// bluish green
		"#009e73",
		"#008060",
		"#006248",
		// yellow
		"#f0e442",
		"#d4ca38",
		"#b0a828",
		// blue
		"#0072b2",
		"#285a90",
		"#104468",
		// vermilion
		"#d55e00",
		"#aa4a00",
		"#803800",
		// reddish purple
		"#cc79a7",
		"#a85888",
		"#863a6a",
		// black
		"#000000",
		"#444444",
		"#777777",
		// light orange
		"#f0a830",
		"#d49220",
		"#b87c10",
		// teal
		"#00b4d8",
		"#0098b0",
		"#007c88",
		// sage
		"#2a9d8f",
		"#208070",
		"#166450",
		// gold
		"#e9c46a",
		"#c8a048",
		"#a88030",
		// steel
		"#457b9d",
		"#326080",
		"#204864",
		// terracotta
		"#e76f51",
		"#c45838",
		"#a04428",
		// plum
		"#9b72aa",
		"#805890",
		"#644074",
	],
};

// ---------------------------------------------------------------------------
// IBM Design — colour-blind–safe base, expanded to 36
// ---------------------------------------------------------------------------

const ibm: Palette = {
	id: "ibm",
	label: "IBM Design (CB-safe)",
	accessible: true,
	colors: [
		// blue 60
		"#0062ff",
		"#4080ff",
		"#2858cc",
		// cyan 60
		"#009cb0",
		"#30b4c4",
		"#007a8a",
		// green 60
		"#24a148",
		"#40b868",
		"#188838",
		// magenta 60
		"#d02670",
		"#e05090",
		"#aa1858",
		// orange 60
		"#f08000",
		"#f49a30",
		"#c86800",
		// red 60
		"#da1e28",
		"#e84850",
		"#b01820",
		// purple 60
		"#8a3ffc",
		"#a068ff",
		"#6c28c8",
		// teal 60
		"#007d79",
		"#309c98",
		"#006060",
		// cool gray
		"#697077",
		"#8c9298",
		"#4c5558",
		// blue 50
		"#0043ce",
		"#2860e0",
		"#1834a0",
		// cyan 50
		"#007d88",
		"#3098a0",
		"#006068",
		// green 50
		"#198038",
		"#389c50",
		"#106828",
		// magenta 50
		"#b01860",
		"#c83880",
		"#8c1048",
		// orange 50
		"#d07000",
		"#e08820",
		"#a85800",
		// red 50
		"#b01820",
		"#c83838",
		"#8c1018",
		// purple 50
		"#6c28c8",
		"#8848e0",
		"#5018a0",
	],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const PALETTES: Record<string, Palette> = {
	catppuccin,
	dracula,
	nord,
	solarized,
	wong,
	"okabe-ito": okabeIto,
	ibm,
};

export const DEFAULT_PALETTE_ID = "catppuccin";

export const PALETTE_IDS = Object.keys(PALETTES) as [string, ...string[]];

/** Lookup a palette by id, falling back to the default. */
export function getPalette(id: string): Palette {
	// biome-ignore lint/style/noNonNullAssertion: safe here, we know Pallete Catppuccin exists
	return PALETTES[id] ?? PALETTES[DEFAULT_PALETTE_ID]!;
}

/** Unassigned-bar colour (grey-500, consistent across palettes). */
export const UNASSIGNED_COLOR = "#6b7280";
