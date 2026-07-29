import { Slider } from "@projection/ui/components/slider";
import { ZoomIn, ZoomOut } from "lucide-react";

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
		<div className="flex w-52 items-center gap-2">
			<ZoomOut className="size-4 text-muted-foreground" />
			<Slider
				min={MIN_DAY_WIDTH}
				max={MAX_DAY_WIDTH}
				step={1}
				value={[dayWidth]}
				onValueChange={(value) =>
					onChange(Array.isArray(value) ? (value[0] ?? dayWidth) : value)
				}
			/>
			<ZoomIn className="size-4 text-muted-foreground" />
		</div>
	);
}
