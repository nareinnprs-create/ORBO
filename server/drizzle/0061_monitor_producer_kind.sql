ALTER TABLE "tasks" DROP CONSTRAINT "tasks_producer_kind_check";--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_producer_kind_check" CHECK ("tasks"."producer_kind" IN ('routine', 'proactive', 'finance', 'monitor'));
