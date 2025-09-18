CREATE TABLE "credit_pricing_plans" (
	"id" serial PRIMARY KEY NOT NULL,
	"plan_code" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"credits" integer NOT NULL,
	"price_usd" integer NOT NULL,
	"discount_percent" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"display_order" integer DEFAULT 0,
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "credit_pricing_plans_plan_code_unique" UNIQUE("plan_code")
);
--> statement-breakpoint
CREATE TABLE "stripe_payment_intents" (
	"id" serial PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"payment_intent_id" varchar(255) NOT NULL,
	"client_secret" varchar(500) NOT NULL,
	"amount" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'usd',
	"status" varchar(50) NOT NULL,
	"credits_requested" integer NOT NULL,
	"discount_percent" integer DEFAULT 0,
	"metadata" json,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "stripe_payment_intents_payment_intent_id_unique" UNIQUE("payment_intent_id")
);
--> statement-breakpoint
ALTER TABLE "stripe_payment_intents" ADD CONSTRAINT "stripe_payment_intents_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_pricing_plans_active_idx" ON "credit_pricing_plans" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "credit_pricing_plans_order_idx" ON "credit_pricing_plans" USING btree ("display_order");--> statement-breakpoint
CREATE INDEX "stripe_payment_intents_org_id_idx" ON "stripe_payment_intents" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "stripe_payment_intents_id_idx" ON "stripe_payment_intents" USING btree ("payment_intent_id");--> statement-breakpoint
CREATE INDEX "stripe_payment_intents_status_idx" ON "stripe_payment_intents" USING btree ("status");