CREATE TABLE "crops" (
	"id" serial PRIMARY KEY NOT NULL,
	"farmland_id" integer,
	"crop_name" text NOT NULL,
	"sowing_date" timestamp NOT NULL,
	"growth_stage" text DEFAULT 'Seedling',
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "farmers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"push_subscription" jsonb,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "farmers_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "farmlands" (
	"id" serial PRIMARY KEY NOT NULL,
	"farmer_id" integer,
	"name" text NOT NULL,
	"polygon_geojson" jsonb NOT NULL,
	"centroid_lat" double precision NOT NULL,
	"centroid_lng" double precision NOT NULL,
	"area_acres" double precision,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "intrusion_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"animal_type" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"source" text DEFAULT 'FOREST_SATELLITE_GRID',
	"severity" text DEFAULT 'HIGH',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "weekly_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"crop_id" integer,
	"weather_summary" jsonb NOT NULL,
	"ai_action_plan" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "crops" ADD CONSTRAINT "crops_farmland_id_farmlands_id_fk" FOREIGN KEY ("farmland_id") REFERENCES "public"."farmlands"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farmlands" ADD CONSTRAINT "farmlands_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_reports" ADD CONSTRAINT "weekly_reports_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE no action ON UPDATE no action;