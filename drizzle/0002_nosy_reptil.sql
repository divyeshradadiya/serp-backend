CREATE TABLE "credit_purchases" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"amount" integer NOT NULL,
	"credits" integer NOT NULL,
	"payment_method" varchar(50),
	"payment_id" varchar(255),
	"status" varchar(20) DEFAULT 'completed' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "user_credits" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"balance" integer DEFAULT 0,
	"total_purchased" integer DEFAULT 0,
	"total_used" integer DEFAULT 0,
	"last_purchase" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
DROP TABLE "organization_subscriptions" CASCADE;--> statement-breakpoint
DROP TABLE "subscription_plans" CASCADE;--> statement-breakpoint
ALTER TABLE "credit_purchases" ADD CONSTRAINT "credit_purchases_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_credits" ADD CONSTRAINT "user_credits_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_purchases_org_id_idx" ON "credit_purchases" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "credit_purchases_status_idx" ON "credit_purchases" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_credits_org_id_idx" ON "user_credits" USING btree ("organization_id");