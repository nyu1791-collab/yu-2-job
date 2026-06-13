CREATE TABLE IF NOT EXISTS "pending_subscription_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"rc_app_user_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"event_timestamp_ms" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_subscription_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "processed_webhook_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"rc_app_user_id" text NOT NULL,
	"user_id" uuid,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_webhook_events_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
ALTER TABLE "subscriptions" ADD COLUMN "last_event_id" text;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "processed_webhook_events" ADD CONSTRAINT "processed_webhook_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
