import { Switch as SwitchPrimitive } from "@base-ui/react/switch";
import { cn } from "@projection/ui/lib/utils";

function Switch({ className, ...props }: SwitchPrimitive.Root.Props) {
	return (
		<SwitchPrimitive.Root
			data-slot="switch"
			className={cn(
				"relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 data-checked:bg-primary data-unchecked:bg-input dark:data-unchecked:bg-input/50",
				className,
			)}
			{...props}
		>
			<SwitchPrimitive.Thumb
				data-slot="switch-thumb"
				className="block size-4 rounded-full bg-background shadow-sm ring-0 transition-transform data-checked:translate-x-4 data-unchecked:translate-x-0.5"
			/>
		</SwitchPrimitive.Root>
	);
}

export { Switch };
