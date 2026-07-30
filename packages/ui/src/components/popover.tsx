import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import { cn } from "@projection/ui/lib/utils";

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
	return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
	return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverPortal({ ...props }: PopoverPrimitive.Portal.Props) {
	return <PopoverPrimitive.Portal data-slot="popover-portal" {...props} />;
}

function PopoverPositioner({
	className,
	...props
}: PopoverPrimitive.Positioner.Props) {
	return (
		<PopoverPrimitive.Positioner
			data-slot="popover-positioner"
			className={cn("z-50", className)}
			{...props}
		/>
	);
}

function PopoverPopup({ className, ...props }: PopoverPrimitive.Popup.Props) {
	return (
		<PopoverPrimitive.Popup
			data-slot="popover-popup"
			className={cn(
				"rounded-md border bg-popover text-popover-foreground shadow-md outline-none",
				className,
			)}
			{...props}
		/>
	);
}

function PopoverClose({ ...props }: PopoverPrimitive.Close.Props) {
	return <PopoverPrimitive.Close data-slot="popover-close" {...props} />;
}

export {
	Popover,
	PopoverClose,
	PopoverPopup,
	PopoverPortal,
	PopoverPositioner,
	PopoverTrigger,
};
