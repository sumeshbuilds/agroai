CREATE TABLE "camera_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"farmer_id" integer NOT NULL,
	"detection_id" integer,
	"label" text NOT NULL,
	"emoji" text DEFAULT '🔔' NOT NULL,
	"category" text DEFAULT 'animal' NOT NULL,
	"confidence" double precision,
	"message" text NOT NULL,
	"source" text DEFAULT 'on-device' NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "camera_detections" ADD COLUMN "confirmed" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "camera_detections" ADD COLUMN "source" text DEFAULT 'on-device' NOT NULL;--> statement-breakpoint
ALTER TABLE "camera_detections" ADD COLUMN "verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "camera_alerts" ADD CONSTRAINT "camera_alerts_session_id_camera_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."camera_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_alerts" ADD CONSTRAINT "camera_alerts_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_alerts" ADD CONSTRAINT "camera_alerts_detection_id_camera_detections_id_fk" FOREIGN KEY ("detection_id") REFERENCES "public"."camera_detections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "camera_alerts_farmer_idx" ON "camera_alerts" USING btree ("farmer_id","created_at");--> statement-breakpoint
CREATE INDEX "camera_alerts_session_idx" ON "camera_alerts" USING btree ("session_id","created_at");