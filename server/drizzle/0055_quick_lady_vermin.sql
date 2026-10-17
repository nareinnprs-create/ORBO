CREATE TABLE "agent_spaces" (
	"agent_id" text NOT NULL,
	"space_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_spaces_agent_id_space_id_pk" PRIMARY KEY("agent_id","space_id")
);
--> statement-breakpoint
CREATE TABLE "spaces" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pages" (
	"id" text PRIMARY KEY NOT NULL,
	"space_id" text NOT NULL,
	"parent_id" text,
	"owner_user_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"format" text DEFAULT 'markdown' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"source_thread_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_spaces" ADD CONSTRAINT "agent_spaces_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_spaces" ADD CONSTRAINT "agent_spaces_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spaces" ADD CONSTRAINT "spaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_parent_id_pages_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_source_thread_id_threads_thread_id_fk" FOREIGN KEY ("source_thread_id") REFERENCES "public"."threads"("thread_id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_spaces_space_idx" ON "agent_spaces" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "spaces_owner_idx" ON "spaces" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "pages_space_idx" ON "pages" USING btree ("space_id","updated_at");--> statement-breakpoint
CREATE INDEX "pages_parent_idx" ON "pages" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "pages_owner_idx" ON "pages" USING btree ("owner_user_id","created_at");