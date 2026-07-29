import { ImageBrokenIcon } from "@phosphor-icons/react/dist/ssr";
import { Button } from "@projection/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@projection/ui/components/empty";
import { Link, type NotFoundRouteProps } from "@tanstack/react-router";

export function NotFoundComponent(_props: NotFoundRouteProps) {
	return (
		<Empty className="w-fit bg-background">
			<EmptyHeader>
				<EmptyMedia variant={"icon"}>
					<ImageBrokenIcon />
				</EmptyMedia>
				<EmptyTitle>Not Found - 404</EmptyTitle>
				<EmptyDescription>
					We've looked everywhere, but the page you are looking for isn't
					available. You might not have permission to view it, or it may have
					been moved or deleted.
				</EmptyDescription>
			</EmptyHeader>
			<EmptyContent>
				<Button variant={"outline"} render={<Link to={"/"} />}>
					Go home
				</Button>
			</EmptyContent>
		</Empty>
	);
}
