CREATE TABLE IF NOT EXISTS "analysis_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"model" text NOT NULL,
	"escalated" boolean DEFAULT false NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_input_tokens" integer DEFAULT 0 NOT NULL,
	"cache_creation_input_tokens" integer DEFAULT 0 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"raw_response" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "barcode_products" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"jan_code" text NOT NULL,
	"name" text NOT NULL,
	"brand" text,
	"kcal" double precision NOT NULL,
	"protein_g" double precision NOT NULL,
	"fat_g" double precision NOT NULL,
	"carbs_g" double precision NOT NULL,
	"per" double precision NOT NULL,
	"source" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_aliases" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"alias" text NOT NULL,
	"food_db_id" bigint NOT NULL,
	CONSTRAINT "food_aliases_alias_unique" UNIQUE("alias")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "food_db" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"food_code" text NOT NULL,
	"name" text NOT NULL,
	"name_normalized" text NOT NULL,
	"group_code" text NOT NULL,
	"kcal_100g" double precision NOT NULL,
	"protein_100g" double precision NOT NULL,
	"fat_100g" double precision NOT NULL,
	"carbs_100g" double precision NOT NULL,
	CONSTRAINT "food_db_food_code_unique" UNIQUE("food_code")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "goals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"goal_type" text NOT NULL,
	"weight_kg" double precision NOT NULL,
	"height_cm" double precision NOT NULL,
	"age" integer NOT NULL,
	"sex" text NOT NULL,
	"activity_level" text NOT NULL,
	"target_kcal" double precision NOT NULL,
	"target_protein_g" double precision NOT NULL,
	"target_fat_g" double precision NOT NULL,
	"target_carbs_g" double precision NOT NULL,
	"effective_from" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meal_items" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"meal_id" bigint NOT NULL,
	"name" text NOT NULL,
	"grams" double precision NOT NULL,
	"kcal" double precision NOT NULL,
	"protein_g" double precision NOT NULL,
	"fat_g" double precision NOT NULL,
	"carbs_g" double precision NOT NULL,
	"confidence" double precision NOT NULL,
	"corrected" boolean DEFAULT false NOT NULL,
	"food_db_id" integer,
	"user_edited" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "meals" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"eaten_on" date NOT NULL,
	"eaten_at" time NOT NULL,
	"meal_type" text NOT NULL,
	"source" text NOT NULL,
	"total_kcal" double precision NOT NULL,
	"total_protein_g" double precision NOT NULL,
	"total_fat_g" double precision NOT NULL,
	"total_carbs_g" double precision NOT NULL,
	"analysis_log_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "refresh_tokens" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "subscriptions" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"rc_app_user_id" text NOT NULL,
	"entitlement" text NOT NULL,
	"status" text NOT NULL,
	"product_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_event_at" timestamp with time zone NOT NULL,
	"raw_last_event" jsonb,
	CONSTRAINT "subscriptions_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"apple_sub" text,
	"google_sub" text,
	"email" text,
	"display_name" text,
	"rc_app_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "users_apple_sub_unique" UNIQUE("apple_sub"),
	CONSTRAINT "users_google_sub_unique" UNIQUE("google_sub"),
	CONSTRAINT "users_rc_app_user_id_unique" UNIQUE("rc_app_user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analysis_logs" ADD CONSTRAINT "analysis_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "food_aliases" ADD CONSTRAINT "food_aliases_food_db_id_food_db_id_fk" FOREIGN KEY ("food_db_id") REFERENCES "public"."food_db"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "goals" ADD CONSTRAINT "goals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meal_items" ADD CONSTRAINT "meal_items_meal_id_meals_id_fk" FOREIGN KEY ("meal_id") REFERENCES "public"."meals"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "meals" ADD CONSTRAINT "meals_analysis_log_id_analysis_logs_id_fk" FOREIGN KEY ("analysis_log_id") REFERENCES "public"."analysis_logs"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "barcode_products_jan_code_idx" ON "barcode_products" USING btree ("jan_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_db_name_normalized_idx" ON "food_db" USING btree ("name_normalized");