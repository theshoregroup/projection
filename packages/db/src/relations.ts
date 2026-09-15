import { defineRelations } from "drizzle-orm";
import { line, project, projectEditor } from "./schema/app";
import { user } from "./schema/auth";

export const mainRelations = defineRelations(
	{ project, line, projectEditor, user },
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
			user: r.one.user({
				from: r.projectEditor.userId,
				to: r.user.id,
				optional: true,
			}),
		},
	}),
);
