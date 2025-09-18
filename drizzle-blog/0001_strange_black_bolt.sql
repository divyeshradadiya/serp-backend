CREATE TABLE "categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "categories_name_unique" UNIQUE("name"),
	CONSTRAINT "categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "blogs" ADD COLUMN "category_ids" jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "blogs" DROP COLUMN "categories";