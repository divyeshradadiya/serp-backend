ALTER TABLE "user_credits" RENAME TO "workspace_credits";--> statement-breakpoint
ALTER TABLE "workspace_credits" DROP CONSTRAINT "user_credits_organization_id_organization_id_fk";
--> statement-breakpoint
DROP INDEX "user_credits_org_id_idx";--> statement-breakpoint
ALTER TABLE "workspace_credits" ADD CONSTRAINT "workspace_credits_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_credits_org_id_idx" ON "workspace_credits" USING btree ("organization_id");