ALTER TABLE "credit_pricing_plans" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "request_logs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "search_cache" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "serp_usage_analytics" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "credit_pricing_plans" CASCADE;--> statement-breakpoint
DROP TABLE "request_logs" CASCADE;--> statement-breakpoint
DROP TABLE "search_cache" CASCADE;--> statement-breakpoint
DROP TABLE "serp_usage_analytics" CASCADE;--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP CONSTRAINT "serp_search_results_api_key_id_api_keys_id_fk";
--> statement-breakpoint
DROP INDEX "serp_api_key_id_idx";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "api_key_id";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "language";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "country";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "safesearch";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "time_range";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "search_instance";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "results";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "error_message";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "ip_address";--> statement-breakpoint
ALTER TABLE "serp_search_results" DROP COLUMN "user_agent";