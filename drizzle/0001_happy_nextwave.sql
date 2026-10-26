ALTER TABLE "farmers" ALTER COLUMN "phone" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "crops" ADD COLUMN "duration_days" integer;--> statement-breakpoint
ALTER TABLE "farmers" ADD COLUMN "pin_hash" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "farmers" ADD CONSTRAINT "farmers_name_unique" UNIQUE("name");