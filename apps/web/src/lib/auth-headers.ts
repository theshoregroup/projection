import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";

// When using client-side auth this is automatic, but we need to prefill
// this on the server for SSR. This will be undefined on the client.
export const getSsrHeaders = createIsomorphicFn()
	.server(() => getRequestHeaders())
	.client(() => undefined);
