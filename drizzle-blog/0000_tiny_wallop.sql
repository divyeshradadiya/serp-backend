CREATE TABLE "blogs" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"read_time" integer NOT NULL,
	"categories" jsonb NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"markdown_content" text NOT NULL,
	CONSTRAINT "blogs_slug_unique" UNIQUE("slug")
);
