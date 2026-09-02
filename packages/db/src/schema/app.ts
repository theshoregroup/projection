import { randomUUID } from "node:crypto";
import { defineRelationsPart } from "drizzle-orm";
import {
	type AnyPgColumn,
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
import { organization, user } from "./auth";

// Domain tables — see CONTEXT.md for the language (Project, Line, Editor…)
// Dates are date-only ISO strings (YYYY-MM-DD), no times or timezones.

export const project = pgTable(
	"project",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => randomUUID()),
		ownerId: text("owner_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		// The organization this Project belongs to, stamped from the Owner's
		// membership at creation (ADR 0008). Nullable: the auth config never
		// assigns orgs, so a user with no membership (e.g. before the invite
		// flow lands) creates org-less Projects.
		organizationId: text("organization_id").references(() => organization.id, {
			onDelete: "set null",
		}),
		name: text("name").notNull(),
		description: text("description"),
		// Seed dates: the Timeline Window's lower bounds while the Project has no Lines
		seedStart: date("seed_start", { mode: "string" }).notNull(),
		seedEnd: date("seed_end", { mode: "string" }).notNull(),
		// Unguessable token powering the public Share Link; regeneratable by the Owner
		shareToken: text("share_token").unique(),
		// Whether Share Link visitors may download the Board as a PDF (Owner-controlled)
		allowVisitorsToExport: boolean("allow_visitors_to_export")
			.default(false)
			.notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("project_organizationId_idx").on(table.organizationId)],
);

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
		// A Group is a Line containing other Lines (CONTEXT.md). Group rows get
		// derived Start/End on read; groupId points at a Line's parent Group.
		isGroup: boolean("is_group").default(false).notNull(),
		groupId: text("group_id").references((): AnyPgColumn => line.id, {
			onDelete: "cascade",
		}),
		// Sparse ordering: new rows land gap-sized steps apart, reorders take
		// midpoints. Sibling-relative: display order is a depth-first flatten.
		sortOrder: doublePrecision("sort_order").notNull(),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [
		index("line_projectId_idx").on(table.projectId),
		index("line_groupId_idx").on(table.groupId),
	],
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

// `project.organizationId` is a plain FK column, not a relation here: the
// `organization` table belongs to the generated authRelations part (schema/auth.ts)
// and both parts are spread into one object in src/index.ts. If a relational
// project→organization query is needed later, add it carefully around that merge.
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
			group: r.one.line({
				from: r.line.groupId,
				to: r.line.id,
				alias: "group",
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
