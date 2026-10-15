CREATE TABLE "threads" (
	"thread_id" text PRIMARY KEY NOT NULL,
	"channel_id" text,
	"agent_id" text,
	"owner_user_id" text NOT NULL,
	"title" text NOT NULL,
	"learning_container_id" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"task_id" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads" ADD CONSTRAINT "threads_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "threads_owner_idx" ON "threads" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "threads_channel_idx" ON "threads" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "threads_agent_idx" ON "threads" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "notifications_owner_idx" ON "notifications" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_task_idx" ON "notifications" USING btree ("task_id");