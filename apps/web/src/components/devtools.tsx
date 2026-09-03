import { BugIcon } from "@phosphor-icons/react";
import { Button } from "@projection/ui/components/button";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { formDevtoolsPlugin } from "@tanstack/react-form-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";

export function DevtoolsPanel() {
	return (
		<TanStackDevtools
			config={{
				position: "bottom-right",
				customTrigger: (
					<Button size={"lg"}>
						<BugIcon /> Devtools
					</Button>
				),
			}}
			plugins={[
				{
					name: "React Query",
					render: () => <ReactQueryDevtoolsPanel />,
				},
				{
					name: "React Router",
					render: () => <TanStackRouterDevtoolsPanel />,
				},
				formDevtoolsPlugin(),
			]}
		/>
	);
}
