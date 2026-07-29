import { env } from "@projection/env/server";
import { DrizzleQueryError } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { DatabaseError } from "pg";
import { relations } from "./relations";

export type DrizzleDbType = NodePgDatabase<typeof relations>;

export function createDb(): DrizzleDbType {
	return drizzle(env.DATABASE_URL, { relations, logger: true });
}

export const isDatabaseError = (error: unknown) => {
	// If it's a drizzle error the actual datatabase error will
	// be located in the `cause` property
  if (error instanceof DrizzleQueryError) {
    // biome-ignore lint/style/noParameterAssign: we need to modify the error in place
		error = error.cause;
	}

	if (error instanceof DatabaseError) {
		return error as DatabaseError;
	}

	return false;
};
