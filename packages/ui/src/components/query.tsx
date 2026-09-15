import { SmileyXEyesIcon } from "@phosphor-icons/react/dist/ssr";
import { isTRPCClientError } from "@trpc/client";
import { type ComponentProps, type ReactNode, Suspense } from "react";
import { ErrorBoundary, type FallbackProps } from "react-error-boundary";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyMedia,
	EmptyTitle,
} from "./empty";
import { Skeleton } from "./skeleton";

function defaultFallback(props: FallbackProps) {
	if (isTRPCClientError(props.error)) {
		// 404/not found
		// While the type isn't there we know this will be
		// { code: "NOT_FOUND" }
		if ("code" in props.error.data && props.error.data.code === "NOT_FOUND") {
			return (
				<Empty>
					<EmptyMedia variant={"icon"}>
						<SmileyXEyesIcon />
					</EmptyMedia>
					<EmptyContent>
						<EmptyTitle>Resource not found, or is unavailable</EmptyTitle>
						<EmptyDescription>{props.error.message}</EmptyDescription>
					</EmptyContent>
				</Empty>
			);
		}
	}

	return (
		<Empty>
			<EmptyMedia variant={"icon"}>
				<SmileyXEyesIcon />
			</EmptyMedia>
			<EmptyContent>
				<EmptyTitle>Something went wrong</EmptyTitle>
				<EmptyDescription>
					{props.error instanceof Error
						? props.error.message
						: String(props.error)}
				</EmptyDescription>
			</EmptyContent>
		</Empty>
	);
}

export function QuerySuspenseBoundary({
	children,
	suspenseFallback,
	errorFallback,
}: {
	children: React.ReactNode;
	suspenseFallback?: ReactNode;
	errorFallback?: ComponentProps<typeof ErrorBoundary>["fallbackRender"];
}) {
	return (
		<Suspense
			fallback={
				suspenseFallback ?? <Skeleton className="aspect-video h-40 w-full" />
			}
		>
			<ErrorBoundary
				fallbackRender={(p) => errorFallback?.(p) ?? defaultFallback(p)}
			>
				{children}
			</ErrorBoundary>
		</Suspense>
	);
}
