CREATE TABLE "proactive_nudges" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"suggestion_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bot_sends" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"kind" text NOT NULL,
	"target" text NOT NULL,
	"provider_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bot_sends_kind_check" CHECK ("bot_sends"."kind" IN ('email', 'slack'))
);
--> statement-breakpoint
ALTER TABLE "proactive_nudges" ADD CONSTRAINT "proactive_nudges_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proactive_nudges" ADD CONSTRAINT "proactive_nudges_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proactive_nudges" ADD CONSTRAINT "proactive_nudges_suggestion_id_proactive_suggestions_id_fk" FOREIGN KEY ("suggestion_id") REFERENCES "public"."proactive_suggestions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_sends" ADD CONSTRAINT "bot_sends_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bot_sends" ADD CONSTRAINT "bot_sends_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "proactive_nudges_suggestion_idx" ON "proactive_nudges" USING btree ("suggestion_id");--> statement-breakpoint
CREATE INDEX "proactive_nudges_owner_idx" ON "proactive_nudges" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "bot_sends_owner_kind_idx" ON "bot_sends" USING btree ("owner_user_id","kind","created_at");