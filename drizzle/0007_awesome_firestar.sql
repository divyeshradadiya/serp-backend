DROP INDEX "serp_query_text_idx";--> statement-breakpoint
ALTER TABLE "api_keys" ADD COLUMN "request_count" integer DEFAULT 0;--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "query_text";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "search_engines";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "page";