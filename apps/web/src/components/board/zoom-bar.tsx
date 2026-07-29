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
		<div className="absolute bottom-2 left-2 flex w-52 items-center gap-2 bg-background/30 backdrop-blur-3xl">
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
