CREATE TABLE "camera_detections" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"farmer_id" integer NOT NULL,
	"label" text NOT NULL,
	"emoji" text DEFAULT '🔎' NOT NULL,
	"category" text DEFAULT 'other' NOT NULL,
	"confidence" double precision,
	"track_id" text,
	"box" jsonb,
	"direction" text,
	"speed" double precision,
	"lat" double precision,
	"lng" double precision,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "camera_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"farmer_id" integer NOT NULL,
	"token" text NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'waiting' NOT NULL,
	"ai_enabled" boolean DEFAULT false NOT NULL,
	"device_label" text,
	"lat" double precision,
	"lng" double precision,
	"latest_frame" text,
	"frame_updated_at" timestamp,
	"frame_width" integer,
	"frame_height" integer,
	"latest_detections" jsonb,
	"motion" double precision DEFAULT 0 NOT NULL,
	"total_detections" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp,
	"last_seen_at" timestamp,
	"ended_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "camera_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "camera_detections" ADD CONSTRAINT "camera_detections_session_id_camera_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."camera_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_detections" ADD CONSTRAINT "camera_detections_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_sessions" ADD CONSTRAINT "camera_sessions_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "camera_detections_session_idx" ON "camera_detections" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "camera_detections_farmer_idx" ON "camera_detections" USING btree ("farmer_id");--> statement-breakpoint
CREATE INDEX "camera_sessions_farmer_idx" ON "camera_sessions" USING btree ("farmer_id");