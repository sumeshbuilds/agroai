ALTER TABLE "farmlands" ADD COLUMN "soil_ph" double precision;--> statement-breakpoint
ALTER TABLE "farmlands" ADD COLUMN "soil_ec" double precision;--> statement-breakpoint
ALTER TABLE "farmlands" ADD COLUMN "soil_organic_carbon" double precision;--> statement-breakpoint
ALTER TABLE "farmlands" ADD COLUMN "soil_nitrogen" double precision;--> statement-breakpoint
ALTER TABLE "farmlands" ADD COLUMN "soil_phosphorus" double precision;--> statement-breakpoint
ALTER TABLE "farmlands" ADD COLUMN "soil_potassium" double precision;--> statement-breakpoint
ALTER TABLE "farmlands" ADD COLUMN "soil_sand_pct" double precision;--> statement-breakpoint
ALTER TABLE "farmlands" ADD COLUMN "soil_clay_pct" double precision;--> statement-breakpoint
ALTER TABLE "farmlands" ADD COLUMN "soil_silt_pct" double precision;--> statement-breakpoint
ALTER TABLE "farmlands" ADD COLUMN "soil_texture" text;--> statement-breakpoint
ALTER TABLE "farmlands" ADD COLUMN "soil_tested_at" timestamp;