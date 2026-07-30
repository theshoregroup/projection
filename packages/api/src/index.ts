import { initTRPC, type TRPC_ERROR_CODE_NUMBER, TRPCError } from "@trpc/server";
import SuperJSON from "superjson";
import z, { ZodError } from "zod";
import type { Context } from "./context";

export const t = initTRPC.context<Context>().create({
	transformer: SuperJSON,

	errorFormatter: ({ shape, error }) => {
		// With drizzle we don't want the whole query to go
		// into the error message

		const rootError = error.cause;
		const returnedErrorCode: TRPC_ERROR_CODE_NUMBER = shape.code;
    const returnedErrorMessage = shape.message;


		return {
			code: returnedErrorCode,
			message: returnedErrorMessage,

			data: {
				...shape.data,

				zodError:
					rootError instanceof ZodError ? z.treeifyError(rootError) : null,
			},
		};
	},
});

export const router = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
	if (!ctx.session) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Authentication required",
			cause: "No session",
		});
	}
	return next({
		ctx: {
			...ctx,
			session: ctx.session,
		},
	});
});
