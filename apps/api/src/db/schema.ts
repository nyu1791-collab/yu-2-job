/**
 * Drizzleスキーマ定義(PLAN.md §4.3)。
 *
 * M2でNeon Postgresへ一括マイグレーションする。
 * このファイル自体はM1時点ではマイグレーション実行しない(型定義・将来の接続準備のみ)。
 *
 * 日付は Asia/Tokyo 固定で DATE 型保存(UTC変換禁止。単一国サービスのため)。
 */

import {
  bigint,
  bigserial,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/** users: Apple/Googleサインインのユーザー */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  appleSub: text("apple_sub").unique(),
  googleSub: text("google_sub").unique(),
  email: text("email"),
  displayName: text("display_name"),
  rcAppUserId: text("rc_app_user_id").unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** refresh_tokens: リフレッシュトークン(sha256ハッシュ保存) */
export const refreshTokens = pgTable("refresh_tokens", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * goals: 目標設定(履歴を残すため、更新時は新規行をinsertする)。
 * goalType: "cut" | "maintain" | "bulk"
 * sex: "male" | "female"
 * activityLevel: "sedentary" | "light" | "moderate" | "active"
 */
export const goals = pgTable("goals", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  goalType: text("goal_type").notNull(), // cut | maintain | bulk
  weightKg: doublePrecision("weight_kg").notNull(),
  heightCm: doublePrecision("height_cm").notNull(),
  age: integer("age").notNull(),
  sex: text("sex").notNull(), // male | female
  activityLevel: text("activity_level").notNull(), // sedentary | light | moderate | active
  targetKcal: doublePrecision("target_kcal").notNull(),
  targetProteinG: doublePrecision("target_protein_g").notNull(),
  targetFatG: doublePrecision("target_fat_g").notNull(),
  targetCarbsG: doublePrecision("target_carbs_g").notNull(),
  effectiveFrom: date("effective_from").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * meals: 記録された食事(写真/テキスト/手動入力)。
 * eatenOn は Asia/Tokyo の DATE。eatenAt は同タイムゾーンの TIME。
 * source: "photo" | "text" | "manual"
 * mealType: "breakfast" | "lunch" | "dinner" | "snack" | "unknown"
 */
export const meals = pgTable("meals", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  eatenOn: date("eaten_on").notNull(),
  eatenAt: time("eaten_at").notNull(),
  mealType: text("meal_type").notNull(), // breakfast | lunch | dinner | snack | unknown
  source: text("source").notNull(), // photo | text | manual
  totalKcal: doublePrecision("total_kcal").notNull(),
  totalProteinG: doublePrecision("total_protein_g").notNull(),
  totalFatG: doublePrecision("total_fat_g").notNull(),
  totalCarbsG: doublePrecision("total_carbs_g").notNull(),
  analysisLogId: bigint("analysis_log_id", { mode: "number" }).references(() => analysisLogs.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

/** meal_items: 食事に含まれる個別の料理・食材 */
export const mealItems = pgTable("meal_items", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  mealId: bigint("meal_id", { mode: "number" })
    .notNull()
    .references(() => meals.id),
  name: text("name").notNull(),
  grams: doublePrecision("grams").notNull(),
  kcal: doublePrecision("kcal").notNull(),
  proteinG: doublePrecision("protein_g").notNull(),
  fatG: doublePrecision("fat_g").notNull(),
  carbsG: doublePrecision("carbs_g").notNull(),
  confidence: doublePrecision("confidence").notNull(),
  corrected: boolean("corrected").notNull().default(false),
  foodDbId: integer("food_db_id"),
  userEdited: boolean("user_edited").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
});

/**
 * food_db: 日本食品標準成分表(八訂・増補2023年)からの取り込み(約2,500食品)。
 * nameNormalized は NFKC正規化・空白除去・ひらがな化済みの名称(GIN gin_trgm_ops用)。
 */
export const foodDb = pgTable(
  "food_db",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    foodCode: text("food_code").notNull().unique(),
    name: text("name").notNull(),
    nameNormalized: text("name_normalized").notNull(),
    groupCode: text("group_code").notNull(),
    kcal100g: doublePrecision("kcal_100g").notNull(),
    protein100g: doublePrecision("protein_100g").notNull(),
    fat100g: doublePrecision("fat_100g").notNull(),
    carbs100g: doublePrecision("carbs_100g").notNull(),
  },
  (table) => ({
    // pg_trgm の GIN インデックス (gin_trgm_ops) はマイグレーションSQLで別途追加する想定。
    nameNormalizedIdx: index("food_db_name_normalized_idx").on(table.nameNormalized),
  }),
);

/** food_aliases: 食材名の別名対応(初期100件手動投入、運用でログから追加) */
export const foodAliases = pgTable("food_aliases", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  alias: text("alias").notNull().unique(),
  foodDbId: bigint("food_db_id", { mode: "number" })
    .notNull()
    .references(() => foodDb.id),
});

/**
 * analysis_logs: 解析リクエストのログ。コスト監視・レート制限カウントに使用。
 * model: "claude-haiku-4-5" | "claude-sonnet-4-6"
 * status: "ok" | "parse_failed" | "not_food" | "error"
 */
export const analysisLogs = pgTable("analysis_logs", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  model: text("model").notNull(),
  escalated: boolean("escalated").notNull().default(false),
  flagged: boolean("flagged").notNull().default(false),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  cacheReadInputTokens: integer("cache_read_input_tokens").notNull().default(0),
  cacheCreationInputTokens: integer("cache_creation_input_tokens").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  status: text("status").notNull(), // ok | parse_failed | not_food | error
  rawResponse: jsonb("raw_response"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * subscriptions: RevenueCat Webhookと同期する課金状態。
 * entitlement: RevenueCatのentitlement識別子
 * status: "trial" | "active" | "billing_issue" | "expired"
 * lastEventId: 直近処理したRevenueCat イベントID(event.id)。Webhookの冪等性に使用する。
 */
export const subscriptions = pgTable("subscriptions", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),
  rcAppUserId: text("rc_app_user_id").notNull(),
  entitlement: text("entitlement").notNull(),
  status: text("status").notNull(), // trial | active | billing_issue | expired
  productId: text("product_id").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  lastEventAt: timestamp("last_event_at", { withTimezone: true }).notNull(),
  lastEventId: text("last_event_id"),
  rawLastEvent: jsonb("raw_last_event"),
});

/**
 * processed_webhook_events: RevenueCat Webhookイベントの冪等性テーブル。
 *
 * event.id ごとに1行記録し、同一イベントの再送をno-opにする
 * (subscriptionsへの反映が完了したことを示す履歴としても使う)。
 */
export const processedWebhookEvents = pgTable("processed_webhook_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  eventId: text("event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  rcAppUserId: text("rc_app_user_id").notNull(),
  userId: uuid("user_id").references(() => users.id),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * pending_subscription_events: RevenueCatの app_user_id が users.rc_app_user_id に
 * まだ紐付いていない場合に、Webhookイベントを一時保存するテーブル。
 *
 * 設計判断(PLAN.md §4.2 M5):
 * - Webhookは「Apple/Googleサインインより先に匿名IDで購入が成立する」順序を許容するため、
 *   app_user_id(RevenueCat匿名ID or エイリアス後ID)に対応する users 行が
 *   見つからない場合でも 404 を返さず 200 を返す(RevenueCatの再送ループを避ける)。
 * - イベントは rc_app_user_id をキーにここへ保存し、ユーザーがサインイン後に
 *   `Purchases.logIn(userId)` -> サーバの `PUT /v1/me/rc-app-user-id` で
 *   users.rc_app_user_id を更新したタイミングで、保留イベントを古い順に再適用し
 *   subscriptionsへ反映する(applyPendingSubscriptionEvents)。
 * - event_id で冪等(同一イベントは1行のみ保存)。
 */
export const pendingSubscriptionEvents = pgTable("pending_subscription_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  eventId: text("event_id").notNull().unique(),
  eventType: text("event_type").notNull(),
  rcAppUserId: text("rc_app_user_id").notNull(),
  payload: jsonb("payload").notNull(),
  eventTimestampMs: bigint("event_timestamp_ms", { mode: "number" }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * barcode_products: Phase2布石(バーコード商品DB)。MVPは定義のみ、取り込みは行わない。
 * source: "off_jp" | "manual"
 */
export const barcodeProducts = pgTable(
  "barcode_products",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    janCode: text("jan_code").notNull(),
    name: text("name").notNull(),
    brand: text("brand"),
    kcal: doublePrecision("kcal").notNull(),
    proteinG: doublePrecision("protein_g").notNull(),
    fatG: doublePrecision("fat_g").notNull(),
    carbsG: doublePrecision("carbs_g").notNull(),
    per: doublePrecision("per").notNull(), // 基準量(g)。通常100g or 1個
    source: text("source").notNull(), // off_jp | manual
  },
  (table) => ({
    janCodeIdx: uniqueIndex("barcode_products_jan_code_idx").on(table.janCode),
  }),
);
