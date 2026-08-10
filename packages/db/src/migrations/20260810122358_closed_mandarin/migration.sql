ALTER TABLE "line" ADD COLUMN "is_group" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "line" ADD COLUMN "group_id" text;--> statement-breakpoint
CREATE INDEX "line_groupId_idx" ON "line" ("group_id");--> statement-breakpoint
ALTER TABLE "line" ADD CONSTRAINT "line_group_id_line_id_fkey" FOREIGN KEY ("group_id") REFERENCES "line"("id") ON DELETE CASCADE;