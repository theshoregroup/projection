import { randomUUID } from "node:crypto";
import { defineRelationsPart } from "drizzle-orm";
import {
	boolean,
	date,
	doublePrecision,
	index,
	integer,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

// Domain tables — see CONTEXT.md for the language (Project, Line, Editor…)
// Dates are date-only ISO strings (YYYY-MM-DD), no times or timezones.

export const project = pgTable("project", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => randomUUID()),
	ownerId: text("owner_id")
		.notNull()
		.references(() => user.id, { onDelete: "cascade" }),
	name: text("name").notNull(),
	description: text("description"),
	// Seed dates: the Timeline Window's lower bounds while the Project has no Lines
	seedStart: date("seed_start", { mode: "string" }).notNull(),
	seedEnd: date("seed_end", { mode: "string" }).notNull(),
	// Unguessable token powering the public Share Link; regeneratable by the Owner
	shareToken: text("share_token").unique(),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

export const line = pgTable(
	"line",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		projectId: text("project_id")
			.notNull()
			.references(() => project.id, { onDelete: "cascade" }),
		item: text("item").notNull(),
		startDate: date("start_date", { mode: "string" }).notNull(),
		endDate: date("end_date", { mode: "string" }).notNull(),
		assignee: text("assignee"),
		note: text("note"),
		percentComplete: integer("percent_complete").default(0).notNull(),
		isMilestone: boolean("is_milestone").default(false).notNull(),
		// Sparse ordering: new rows land gap-sized steps apart, reorders take midpoints
		sortOrder: doublePrecision("sort_order").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("line_projectId_idx").on(table.projectId)],
);

export const EDITOR_STATUSES = ["pending", "active"] as const;
export type EditorStatus = (typeof EDITOR_STATUSES)[number];

export const projectEditor = pgTable(
	"project_editor",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		projectId: text("project_id")
			.notNull()
			.references(() => project.id, { onDelete: "cascade" }),
		// Null while the invite is a Pending Invite (no account yet)
		userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
		email: text("email").notNull(),
		status: text("status", { enum: EDITOR_STATUSES }).notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		uniqueIndex("projectEditor_projectId_email_uidx").on(
			table.projectId,
			table.email,
		),
		index("projectEditor_userId_idx").on(table.userId),
	],
);

export const appRelations = defineRelationsPart(
	{ project, line, projectEditor },
	(r) => ({
		project: {
			lines: r.many.line({
				from: r.project.id,
				to: r.line.projectId,
			}),
			editors: r.many.projectEditor({
				from: r.project.id,
				to: r.projectEditor.projectId,
			}),
		},
		line: {
			project: r.one.project({
				from: r.line.projectId,
				to: r.project.id,
			}),
		},
		projectEditor: {
			project: r.one.project({
				from: r.projectEditor.projectId,
				to: r.project.id,
			}),
		},
	}),
);
