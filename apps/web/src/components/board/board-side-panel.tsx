import { Button } from "@projection/ui/components/button";
import { Separator } from "@projection/ui/components/separator";
import { cn } from "@projection/ui/lib/utils";
import { ASSIGNEE_MIN_WIDTH } from "@/hooks/use-board-panel";

interface BoardSidePanelProps {
	isOpen: boolean;
	width: number;
	assigneeWidth: number;
	maxAssigneeWidth: number;
	maxPanelWidth: number;
	allowPanelResize?: boolean;
	onStartResize: (event: React.PointerEvent) => void;
	onStartRailOpen: (event: React.PointerEvent) => void;
	onStartAssigneeResize: (event: React.PointerEvent) => void;
	onPointerMove: (event: React.PointerEvent) => void;
	onPointerUp: (event: React.PointerEvent) => void;
	onToggle: () => void;
	children: React.ReactNode;
}

export default function BoardSidePanel({
	isOpen,
	width,
	assigneeWidth,
	maxAssigneeWidth,
	maxPanelWidth,
	allowPanelResize = true,
	onStartResize,
	onStartRailOpen,
	onStartAssigneeResize,
	onPointerMove,
	onPointerUp,
	onToggle,
	children,
}: BoardSidePanelProps) {
	return (
		<div
			data-slot="board-side-panel"
			className={cn("relative", isOpen ? "border-r" : "border-r-0")}
			style={
				{
					width: isOpen ? width : 0,
					"--board-assignee-width": `${assigneeWidth}px`,
				} as React.CSSProperties
			}
		>
			{isOpen ? (
				<>
					{children}
					<Separator
						aria-label="Resize assignee column"
						orientation="vertical"
						aria-valuemin={ASSIGNEE_MIN_WIDTH}
						aria-valuemax={maxAssigneeWidth}
						aria-valuenow={assigneeWidth}
						tabIndex={0}
						className={cn(
							"absolute inset-y-0 z-10 w-0.5 cursor-col-resize bg-border/80",
							"focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
						)}
						style={{ right: "calc(var(--board-assignee-width) + 4px)" }}
						onPointerDown={onStartAssigneeResize}
						onPointerMove={onPointerMove}
						onPointerUp={onPointerUp}
						onPointerCancel={onPointerUp}
					/>
					{allowPanelResize && (
						<Separator
							aria-label="Resize rows panel"
							orientation="vertical"
							aria-valuemin={0}
							aria-valuemax={maxPanelWidth}
							aria-valuenow={width}
							tabIndex={0}
							className={cn(
								"absolute inset-y-0 right-0 z-20 w-1 cursor-ew-resize hover:bg-border/80",
								"focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
							)}
							onPointerDown={onStartResize}
							onPointerMove={onPointerMove}
							onPointerUp={onPointerUp}
							onPointerCancel={onPointerUp}
							onKeyDown={(event) => {
								if (event.key === "Enter" || event.key === " ") {
									event.preventDefault();
									onToggle();
								}
							}}
						/>
					)}
				</>
			) : (
				<Button
					type="button"
					variant="ghost"
					aria-label="Open rows panel"
					tabIndex={0}
					className={cn(
						"absolute inset-y-0 left-0 z-20 w-1 cursor-e-resize hover:bg-border/80",
						"focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring",
						"h-auto rounded-none border-0 p-0",
					)}
					onPointerDown={onStartRailOpen}
					onPointerMove={onPointerMove}
					onPointerUp={onPointerUp}
					onPointerCancel={onPointerUp}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							onToggle();
						}
					}}
				/>
			)}
		</div>
	);
}
