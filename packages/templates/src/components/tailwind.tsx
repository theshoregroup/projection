import type { ReactNode } from "react";
import { Font, pixelBasedPreset, Tailwind } from "react-email";

// Colors converted from OKLCH (globals.css) to hex for email client compatibility.
// Light mode only — email clients don't support dark mode CSS variables.
const colors = {
	// Semantic tokens
	background: "#ffffff",
	foreground: "#0c090c",
	card: "#ffffff",
	"card-foreground": "#0c090c",
	popover: "#ffffff",
	"popover-foreground": "#0c090c",
	primary: {
		DEFAULT: "#c6005c",
		foreground: "#fdf2f8",
	},
	secondary: {
		DEFAULT: "#f4f4f5",
		foreground: "#18181b",
	},
	muted: {
		DEFAULT: "#f3f1f3",
		foreground: "#79697b",
	},
	accent: {
		DEFAULT: "#c6005c",
		foreground: "#fdf2f8",
	},
	destructive: {
		DEFAULT: "#dc2626",
		foreground: "#fef2f2",
	},
	border: "#e8e8e0",
	input: "#e8e8e0",
	ring: "#b3b3a0",
	// Charts
	chart: {
		1: "#4dc9a8",
		2: "#2da882",
		3: "#1e8a6e",
		4: "#c6005c",
		5: "#1a7060",
	},
	// Sidebar
	sidebar: {
		DEFAULT: "#fafaf7",
		foreground: "#0c090c",
		primary: "#1e8a6e",
		"primary-foreground": "#fdf2f8",
		accent: "#f3f1f3",
		"accent-foreground": "#fdf2f8",
		border: "#e8e8e0",
		ring: "#b3b3a0",
	},
};

export function TailwindWrapper({ children }: { children: ReactNode }) {
	return (
		<Tailwind
			config={{
				presets: [pixelBasedPreset],
				theme: {
					// fontFamily: {
					//   sans: ['Geist, "Helvetica Neue"', "Helvetica", "Arial", "sans-serif"],
					// },
					extend: {
						colors,

						// --radius: 0.45rem (7.2px), scaled to match globals.css
						borderRadius: {
							sm: "4px",
							md: "6px",
							lg: "7px",
							xl: "10px",
							"2xl": "13px",
							"3xl": "16px",
							"4xl": "19px",
						},
					},
				},
			}}
		>
			{children}
		</Tailwind>
	);
}

export function GeistFont() {
	return (
		<Font
			fontFamily="Geist"
			fallbackFontFamily="Times New Roman"
			webFont={{
				url: "https://fonts.gstatic.com/s/geist/v4/gyByhwUxId8gMEwcGFWNOITd.woff2",
				format: "woff2",
			}}
			fontWeight={400}
			fontStyle="normal"
		/>
	);
}
