CREATE TABLE "memory_mining" (
	"thread_id" text PRIMARY KEY,
	"owner_user_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"mined_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "memory_mining" ADD CONSTRAINT "memory_mining_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
	ALTER TABLE "memory_mining" ADD CONSTRAINT "memory_mining_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
END $$;
