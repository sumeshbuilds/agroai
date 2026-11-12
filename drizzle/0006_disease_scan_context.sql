ALTER TABLE "disease_scans" ADD COLUMN "subject" text DEFAULT 'plant' NOT NULL;--> statement-breakpoint
ALTER TABLE "disease_scans" ADD COLUMN "image_quality" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "disease_scans" ADD COLUMN "retake_advice" text;--> statement-breakpoint
ALTER TABLE "disease_scans" ADD COLUMN "spread_risk" text DEFAULT 'unknown' NOT NULL;--> statement-breakpoint
ALTER TABLE "disease_scans" ADD COLUMN "urgency" text DEFAULT 'monitor' NOT NULL;--> statement-breakpoint
ALTER TABLE "disease_scans" ADD COLUMN "differentials" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "disease_scans" ADD COLUMN "monitoring" text;