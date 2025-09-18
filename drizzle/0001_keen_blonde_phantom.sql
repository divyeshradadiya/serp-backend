CREATE TABLE "organization_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"plan_id" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"current_period_start" timestamp NOT NULL,
	"current_period_end" timestamp NOT NULL,
	"requests_used" integer DEFAULT 0,
	"requests_limit" integer NOT NULL,
	"billing_interval" varchar(20) DEFAULT 'monthly',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "serp_configuration" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"instance_url" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true,
	"priority" integer DEFAULT 1,
	"max_requests_per_minute" integer DEFAULT 30,
	"last_health_check" timestamp,
	"health_status" varchar(20) DEFAULT 'unknown',
	"response_time" integer,
	"supported_engines" json,
	"notes" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "serp_search_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text,
	"api_key_id" integer,
	"query_text" varchar(500) NOT NULL,
	"search_engine" varchar(50) NOT NULL,
	"search_engines" text,
	"language" varchar(10) DEFAULT 'en',
	"country" varchar(5),
	"safesearch" integer DEFAULT 1,
	"time_range" varchar(20),
	"page" integer DEFAULT 1,
	"results_count" integer DEFAULT 0,
	"response_time" integer,
	"search_instance" varchar(255),
	"results" json NOT NULL,
	"error_message" text,
	"status" varchar(20) DEFAULT 'success' NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "serp_usage_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"api_key_id" integer,
	"date" timestamp NOT NULL,
	"total_requests" integer DEFAULT 0,
	"successful_requests" integer DEFAULT 0,
	"failed_requests" integer DEFAULT 0,
	"rate_limited_requests" integer DEFAULT 0,
	"avg_response_time" integer,
	"unique_queries" integer DEFAULT 0,
	"total_results" integer DEFAULT 0,
	"search_engine_stats" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"monthly_requests" integer NOT NULL,
	"rate_limit" integer NOT NULL,
	"price" integer DEFAULT 0,
	"features" json,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_subscriptions" ADD CONSTRAINT "organization_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_search_results" ADD CONSTRAINT "serp_search_results_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_search_results" ADD CONSTRAINT "serp_search_results_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_usage_analytics" ADD CONSTRAINT "serp_usage_analytics_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "serp_usage_analytics" ADD CONSTRAINT "serp_usage_analytics_api_key_id_api_keys_id_fk" FOREIGN KEY ("api_key_id") REFERENCES "public"."api_keys"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_subscription_org_id_idx" ON "organization_subscriptions" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "org_subscription_status_idx" ON "organization_subscriptions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "serp_config_active_idx" ON "serp_configuration" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "serp_config_priority_idx" ON "serp_configuration" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "serp_config_health_idx" ON "serp_configuration" USING btree ("health_status");--> statement-breakpoint
CREATE INDEX "serp_organization_id_idx" ON "serp_search_results" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "serp_api_key_id_idx" ON "serp_search_results" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "serp_query_text_idx" ON "serp_search_results" USING btree ("query_text");--> statement-breakpoint
CREATE INDEX "serp_search_engine_idx" ON "serp_search_results" USING btree ("search_engine");--> statement-breakpoint
CREATE INDEX "serp_created_at_idx" ON "serp_search_results" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "serp_status_idx" ON "serp_search_results" USING btree ("status");--> statement-breakpoint
CREATE INDEX "analytics_organization_id_idx" ON "serp_usage_analytics" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "analytics_api_key_id_idx" ON "serp_usage_analytics" USING btree ("api_key_id");--> statement-breakpoint
CREATE INDEX "analytics_date_idx" ON "serp_usage_analytics" USING btree ("date");