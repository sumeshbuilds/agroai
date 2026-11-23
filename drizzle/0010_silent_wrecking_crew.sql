CREATE TABLE "camera_peek_sessions" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"farmer_id" integer NOT NULL,
	"offer" text NOT NULL,
	"answer" text,
	"status" text DEFAULT 'requested' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "camera_alerts" ADD COLUMN "image_data" text;--> statement-breakpoint
ALTER TABLE "camera_alerts" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "camera_alerts" ADD COLUMN "captured_at" timestamp;--> statement-breakpoint
ALTER TABLE "camera_sessions" ADD COLUMN "battery_level" integer;--> statement-breakpoint
ALTER TABLE "camera_sessions" ADD COLUMN "last_heartbeat" timestamp;--> statement-breakpoint
ALTER TABLE "camera_sessions" ADD COLUMN "pairing_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "camera_sessions" ADD COLUMN "last_event_at" timestamp;--> statement-breakpoint
ALTER TABLE "camera_sessions" ADD COLUMN "live_peek_until" timestamp;--> statement-breakpoint
ALTER TABLE "camera_peek_sessions" ADD CONSTRAINT "camera_peek_sessions_session_id_camera_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."camera_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "camera_peek_sessions" ADD CONSTRAINT "camera_peek_sessions_farmer_id_farmers_id_fk" FOREIGN KEY ("farmer_id") REFERENCES "public"."farmers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "camera_peek_session_idx" ON "camera_peek_sessions" USING btree ("session_id","expires_at");--> statement-breakpoint
CREATE INDEX "camera_peek_farmer_idx" ON "camera_peek_sessions" USING btree ("farmer_id");