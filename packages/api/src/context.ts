import { auth } from "@projection/auth";
import { createDb } from "@projection/db";

export async function createContext({ req }: { req: Request }) {
	const session = await auth.api.getSession({
		headers: req.headers,
	});
	return {
		db: createDb(),
		session,
	};
}

export type Context = Awaited<ReturnType<typeof createContext>>;
