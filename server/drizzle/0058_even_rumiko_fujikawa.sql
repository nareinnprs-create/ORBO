CREATE TABLE "memory_mining" (
	"thread_id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"mined_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_producer_kind_check";--> statement-breakpoint
ALTER TABLE "mcp_servers" ADD COLUMN "disabled_tools" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "approval_team_settings" ADD COLUMN "auto_run_reads" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "memory_mining" ADD CONSTRAINT "memory_mining_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_mining" ADD CONSTRAINT "memory_mining_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_producer_kind_check" CHECK ("tasks"."producer_kind" IN ('routine', 'proactive', 'finance', 'monitor'));