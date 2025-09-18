ALTER TABLE "api_keys" ADD COLUMN "request_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "api_keys" DROP COLUMN "last_used";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "query_text";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "search_engines";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "page";--> statement-breakpoint
ALTER TABLE "serp_search_results" ADD COLUMN "response_time" integer;--> statement-breakpoint
DROP INDEX "serp_query_text_idx";