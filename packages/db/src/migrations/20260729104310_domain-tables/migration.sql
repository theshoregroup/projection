CREATE TABLE "line" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"item" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"assignee" text,
	"note" text,
	"percent_complete" integer DEFAULT 0 NOT NULL,
	"is_milestone" boolean DEFAULT false NOT NULL,
	"sort_order" double precision NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"seed_start" date NOT NULL,
	"seed_end" date NOT NULL,
	"share_token" text UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_editor" (
	"id" text PRIMARY KEY,
	"project_id" text NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "line_projectId_idx" ON "line" ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "projectEditor_projectId_email_uidx" ON "project_editor" ("project_id","email");--> statement-breakpoint
CREATE INDEX "projectEditor_userId_idx" ON "project_editor" ("user_id");--> statement-breakpoint
ALTER TABLE "line" ADD CONSTRAINT "line_project_id_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_owner_id_user_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "auth"."user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_editor" ADD CONSTRAINT "project_editor_project_id_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "project"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "project_editor" ADD CONSTRAINT "project_editor_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE CASCADE;