CREATE TABLE "monitors" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"task_id" text,
	"url" text NOT NULL,
	"condition" text DEFAULT 'change' NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"interval_minutes" integer DEFAULT 15 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"next_check_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	"last_hash" text,
	"last_value" text,
	"checks" integer DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monitors_interval_check" CHECK ("monitors"."interval_minutes" >= 1 AND "monitors"."interval_minutes" <= 10080),
	CONSTRAINT "monitors_condition_check" CHECK ("monitors"."condition" IN ('change', 'contains', 'price_below')),
	CONSTRAINT "monitors_status_check" CHECK ("monitors"."status" IN ('active', 'paused', 'stopped'))
);
--> statement-breakpoint
ALTER TABLE "monitors" ADD CONSTRAINT "monitors_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "monitors_owner_idx" ON "monitors" USING btree ("owner_user_id","status");--> statement-breakpoint
CREATE INDEX "monitors_due_idx" ON "monitors" USING btree ("status","next_check_at");