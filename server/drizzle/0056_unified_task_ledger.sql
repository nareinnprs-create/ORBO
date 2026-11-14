CREATE TABLE "task_events" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"run_id" text NOT NULL,
	"kind" text DEFAULT 'receipt' NOT NULL,
	"title" text NOT NULL,
	"detail" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	CONSTRAINT "task_events_kind_check" CHECK ("task_events"."kind" IN ('receipt'))
);
--> statement-breakpoint
CREATE TABLE "task_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"error" text,
	CONSTRAINT "task_runs_status_check" CHECK ("task_runs"."status" IN ('running', 'succeeded', 'failed'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"producer_kind" text NOT NULL,
	"producer_id" text NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_status_check" CHECK ("tasks"."status" IN ('open', 'running', 'succeeded', 'failed')),
	CONSTRAINT "tasks_producer_kind_check" CHECK ("tasks"."producer_kind" IN ('routine', 'proactive', 'finance'))
);
--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "consecutive_failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "alert_sequence" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "monitors" ADD COLUMN "last_timeless_hash" text;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_run_id_task_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."task_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_runs" ADD CONSTRAINT "task_runs_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_events_run_id_key" ON "task_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "task_events_task_idx" ON "task_events" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "task_runs_task_id_key" ON "task_runs" USING btree ("task_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_key_key" ON "tasks" USING btree ("key");--> statement-breakpoint
CREATE INDEX "tasks_producer_idx" ON "tasks" USING btree ("producer_kind","producer_id");--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;