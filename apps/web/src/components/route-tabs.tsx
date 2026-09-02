import { Tabs as OriginalTabs } from "@projection/ui/components/tabs";
import { useLocation, useNavigate } from "@tanstack/react-router";
import type { getRouter } from "../router";

type TabType = Omit<
	Parameters<typeof OriginalTabs>[0],
	"value" | "onValueChange"
>;

/**
 * URL-synced tabs (openrams pattern): the tab value is the path segment
 * after `from` (defaulting to `defaultTo`), and switching navigates.
 */
export function useRouteTabs(params: {
	from: NonNullable<
		NonNullable<
			Parameters<typeof useNavigate<ReturnType<typeof getRouter>>>[0]
		>["from"]
	>;
	defaultTo: string;
}) {
	const navigator = useNavigate(params);
	const currentLocation = useLocation();

	const splitPath = currentLocation.pathname
		?.split(params.from)[1]
		?.split("/")[1];

	return (p: TabType) =>
		OriginalTabs({
			...p,
			value: splitPath ?? params.defaultTo,
			onValueChange: (v) =>
				navigator({
					// biome-ignore lint/suspicious/noExplicitAny: tab values are simple path segments
					to: (v === params.defaultTo ? params.from : v) as any,
				}),
		});
}
