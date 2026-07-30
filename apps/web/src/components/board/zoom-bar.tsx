import {
	MagnifyingGlassMinusIcon,
	MagnifyingGlassPlusIcon,
} from "@phosphor-icons/react/dist/ssr";
import { Slider } from "@projection/ui/components/slider";
import { MAX_DAY_WIDTH, MIN_DAY_WIDTH } from "@/lib/board-layout/geometry";

/** Horizontal-only zoom (CONTEXT.md — Board): controls pixels-per-day. */
export default function ZoomBar({
	dayWidth,
	onChange,
}: {
	dayWidth: number;
	onChange: (dayWidth: number) => void;
}) {
	return (
		// Fixed, not absolute: main is the page's full height, so an absolutely
		// positioned bar would sit at the bottom of the *content* and scroll
		// away. Fixed pins it to the viewport's bottom-right — main's right
		// edge — where it follows scrolling.
		<div className="fixed right-4 bottom-4 z-50 flex w-52 items-center gap-2 rounded-lg border bg-background/95 p-2 shadow-md backdrop-blur">
			<MagnifyingGlassMinusIcon className="size-4 text-muted-foreground" />
			<Slider
				min={MIN_DAY_WIDTH}
				max={MAX_DAY_WIDTH}
				step={1}
				value={[dayWidth]}
				onValueChange={(value) =>
					onChange(Array.isArray(value) ? (value[0] ?? dayWidth) : value)
				}
			/>
			<MagnifyingGlassPlusIcon className="size-4 text-muted-foreground" />
		</div>
	);
}
