import { redirect } from "@tanstack/react-router";

/**
 * Redirect to an arbitrary app path. Targets here are dynamic (user-supplied
 * `?redirect=` values or post-auth landing logic), so the typed route registry
 * can't express them — cast around the runtime-validated string.
 */
export function redirectPath(
	to: string,
	search?: Record<string, unknown>,
): never {
	// biome-ignore lint/suspicious/noExplicitAny: dynamic targets bypass the typed registry
	return redirect({ to: to as any, search } as any) as never;
}
