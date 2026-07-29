import { sql } from "drizzle-orm/sql";

export const countOverSql = sql<number>`CAST(COUNT(*) OVER() AS INTEGER)`;
