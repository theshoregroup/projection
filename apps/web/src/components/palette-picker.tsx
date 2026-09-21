import {
	DEFAULT_PALETTE_ID,
	PALETTES,
	type Palette,
} from "@projection/db/palettes";
import { Label } from "@projection/ui/components/label";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@projection/ui/components/select";

/** A palette picker with colour swatch previews. Uses a grouped `<select>`
 * with accessible palettes in their own group. */
export function PalettePicker({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const current = PALETTES[value] ?? PALETTES[DEFAULT_PALETTE_ID]!;
	const accessiblePalettes = Object.values(PALETTES).filter(
		(p: Palette) => p.accessible,
	);
	const standardPalettes = Object.values(PALETTES).filter(
		(p: Palette) => !p.accessible,
	);

	return (
		<div className="space-y-2">
			<Label htmlFor="color-palette">Colour palette</Label>
			<Select value={value} onValueChange={(v) => onChange(v ?? value)}>
				<SelectTrigger id="color-palette" className="w-full">
					<SelectValue>
						<div className="flex items-center gap-2">
							<PaletteSwatch palette={current} />
							<span>{current.label}</span>
						</div>
					</SelectValue>
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						<SelectLabel>Standard</SelectLabel>
						{standardPalettes.map((p: Palette) => (
							<SelectItem key={p.id} value={p.id}>
								<div className="flex items-center gap-2">
									<PaletteSwatch palette={p} />
									<span>{p.label}</span>
								</div>
							</SelectItem>
						))}
					</SelectGroup>
					<SelectGroup>
						<SelectLabel>Accessible (colour-blind safe)</SelectLabel>
						{accessiblePalettes.map((p: Palette) => (
							<SelectItem key={p.id} value={p.id}>
								<div className="flex items-center gap-2">
									<PaletteSwatch palette={p} />
									<span className="flex items-center gap-1">
										{p.label}
										<span className="rounded bg-emerald-100 px-1 text-[10px] font-medium text-emerald-700">
											CB
										</span>
									</span>
								</div>
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
		</div>
	);
}

/** Mini colour swatch strip showing the first 12 colours of a palette. */
function PaletteSwatch({ palette }: { palette: Palette }) {
	const preview = palette.colors.slice(0, 12);
	return (
		<span
			className="inline-flex shrink-0 items-center gap-0.5 rounded-sm border border-border p-0.5"
			aria-hidden
		>
			{preview.map((colour: string, i: number) => (
				<span
					key={`${palette.id}-${i}`}
					className="inline-block size-2 rounded-sm"
					style={{ backgroundColor: colour }}
				/>
			))}
		</span>
	);
}