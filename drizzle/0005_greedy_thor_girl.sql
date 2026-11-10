CREATE TABLE "disease_scans" (
	"id" serial PRIMARY KEY NOT NULL,
	"farmer_id" integer NOT NULL,
	"crop_id" integer,
	"crop_name" text,
	"plant_part" text DEFAULT 'leaf' NOT NULL,
	"note" text,
	"image_mime" text DEFAULT 'image/jpeg' NOT NULL,
	"image_data" text NOT NULL,
	"health_status" text NOT NULL,
	"disease_name" text,
	"pathogen_type" text DEFAULT 'unknown' NOT NULL,
	"severity" text DEFAULT 'unknown' NOT NULL,
	"confidence" double precision DEFAULT 0 NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"symptoms" jsonb NOT NULL,
	"causes" jsonb NOT NULL,
	"immediate_actions" jsonb NOT NULL,
	"organic_treatment" jsonb NOT NULL,
	"chemical_treatment" jsonb NOT NULL,
	"prevention" jsonb NOT NULL,
	"look_alikes" jsonb NOT NULL,
	"source" text DEFAULT 'gemini' NOT NULL,
	"model" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "disease_scans" ADD CONSTRAINT "disease_scans_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "disease_scans" ADD CONSTRAINT "disease_scans_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "disease_scans_farmer_idx" ON "disease_scans" USING btree ("farmer_id","created_at");--> statement-breakpoint
CREATE INDEX "disease_scans_crop_idx" ON "disease_scans" USING btree ("crop_id");