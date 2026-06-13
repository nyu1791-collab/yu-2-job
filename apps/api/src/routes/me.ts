/**
 * プロフィール・目標API(PLAN.md §4.3 / §4.5 M3)。
 *
 * - GET/PUT /v1/me      : プロフィール(display_name, email)
 * - GET/PUT /v1/me/goal : 目標設定。PUTは新しいgoals行をinsertし、履歴を残す。
 *                         sharedのgoal-calcでtarget_kcal/P/F/Cを計算して保存する。
 *
 * 認証: requireAuth()(自前JWT or devトークン)。
 * DB未設定(DATABASE_URLなし・非テスト環境)の場合は503を返す。
 */

import { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { calculateGoal, recalculatePfcForKcal } from "@pashacaro/shared";
import { getDb, isDbConfigured } from "../db/client.js";
import { goals, users } from "../db/schema.js";
import { getEntitlementInfo } from "../lib/entitlement.js";
import { getUserId, requireAuth } from "../lib/auth.js";
import { applyPendingSubscriptionEvents } from "../lib/revenuecat.js";

export const meRoute = new Hono();

const UpdateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).nullable().optional(),
  email: z.string().email().nullable().optional(),
});

const GoalTypeSchema = z.enum(["cut", "maintain", "bulk"]);
const SexSchema = z.enum(["male", "female"]);
const ActivityLevelSchema = z.enum(["sedentary", "light", "moderate", "active"]);

const UpdateGoalSchema = z.object({
  goalType: GoalTypeSchema,
  weightKg: z.number().positive(),
  heightCm: z.number().positive(),
  age: z.number().int().positive(),
  sex: SexSchema,
  activityLevel: ActivityLevelSchema,
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式で指定してください。").optional(),
  /**
   * オンボーディングの目標カロリー微調整(±50kcal)で変更した値があれば指定する。
   * 指定時はgoal-calcのtargetKcalを上書きし、P(体重ベース)を固定してF/Cを再計算する。
   */
  targetKcalOverride: z.number().positive().optional(),
});

function dbUnavailableResponse(c: import("hono").Context) {
  return c.json(
    {
      error_kind: "db_unavailable",
      message: "DBが設定されていません。DATABASE_URLを設定してください。",
    },
    503,
  );
}

/** Asia/Tokyo の今日の日付を "YYYY-MM-DD" で返す。 */
function todayTokyo(): string {
  const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
  const tokyoNow = new Date(Date.now() + TOKYO_OFFSET_MS);
  const y = tokyoNow.getUTCFullYear();
  const m = String(tokyoNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(tokyoNow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * GET /v1/me
 * プロフィール(id, email, displayName)を返す。
 */
meRoute.get("/v1/me", requireAuth(), async (c) => {
  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }
  const userId = getUserId(c);
  const db = await getDb();

  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) {
    return c.json({ error_kind: "not_found", message: "ユーザーが見つかりません。" }, 404);
  }

  return c.json(
    {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
    },
    200,
  );
});

/**
 * PUT /v1/me
 * {displayName?, email?} -> 更新後のプロフィール
 */
meRoute.put("/v1/me", requireAuth(), async (c) => {
  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }
  const userId = getUserId(c);

  const body = await c.req.json().catch(() => null);
  const parseResult = UpdateProfileSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ error_kind: "invalid_request", message: "リクエストボディが不正です。" }, 400);
  }

  const db = await getDb();
  const updates: Partial<{ displayName: string | null; email: string | null }> = {};
  if (parseResult.data.displayName !== undefined) {
    updates.displayName = parseResult.data.displayName;
  }
  if (parseResult.data.email !== undefined) {
    updates.email = parseResult.data.email;
  }

  if (Object.keys(updates).length > 0) {
    await db.update(users).set(updates).where(eq(users.id, userId));
  }

  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) {
    return c.json({ error_kind: "not_found", message: "ユーザーが見つかりません。" }, 404);
  }

  return c.json(
    {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      createdAt: user.createdAt,
    },
    200,
  );
});

/**
 * GET /v1/me/goal
 * 現在有効な目標(最新のgoals行)を返す。未設定の場合は404。
 */
meRoute.get("/v1/me/goal", requireAuth(), async (c) => {
  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }
  const userId = getUserId(c);
  const db = await getDb();

  const rows = await db
    .select()
    .from(goals)
    .where(eq(goals.userId, userId))
    .orderBy(desc(goals.id))
    .limit(1);

  const goal = rows[0];
  if (!goal) {
    return c.json({ error_kind: "not_found", message: "目標が設定されていません。" }, 404);
  }

  return c.json({ goal }, 200);
});

/**
 * PUT /v1/me/goal
 * {goalType, weightKg, heightCm, age, sex, activityLevel, effectiveFrom?}
 * -> sharedのgoal-calcでtarget_kcal/P/F/Cを計算し、新しいgoals行をinsert(履歴保持)。
 */
meRoute.put("/v1/me/goal", requireAuth(), async (c) => {
  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }
  const userId = getUserId(c);

  const body = await c.req.json().catch(() => null);
  const parseResult = UpdateGoalSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ error_kind: "invalid_request", message: "リクエストボディが不正です。" }, 400);
  }
  const input = parseResult.data;

  const baseCalc = calculateGoal({
    weightKg: input.weightKg,
    heightCm: input.heightCm,
    age: input.age,
    sex: input.sex,
    activityLevel: input.activityLevel,
    goalType: input.goalType,
  });

  // targetKcalOverride指定時は、goal-calcのtargetKcalを上書きしP/F/Cを再計算する
  // (オンボーディングの目標カロリー微調整 ±50kcal)。
  const calc =
    input.targetKcalOverride !== undefined
      ? {
          ...baseCalc,
          ...recalculatePfcForKcal({
            targetKcal: input.targetKcalOverride,
            proteinG: baseCalc.targetProteinG,
          }),
        }
      : baseCalc;

  const db = await getDb();

  const inserted = await db
    .insert(goals)
    .values({
      userId,
      goalType: input.goalType,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      age: input.age,
      sex: input.sex,
      activityLevel: input.activityLevel,
      targetKcal: calc.targetKcal,
      targetProteinG: calc.targetProteinG,
      targetFatG: calc.targetFatG,
      targetCarbsG: calc.targetCarbsG,
      effectiveFrom: input.effectiveFrom ?? todayTokyo(),
    })
    .returning();

  const goalRow = inserted[0];
  if (!goalRow) {
    return c.json({ error_kind: "error", message: "目標の保存に失敗しました。" }, 500);
  }

  return c.json({ goal: goalRow }, 200);
});

/**
 * GET /v1/me/entitlement
 * 現在のentitlement(課金)状況を返す(PLAN.md §4.5 M5)。
 *
 * subscriptions行が無い場合は status:"none", entitled:false を返す(404にしない)。
 */
meRoute.get("/v1/me/entitlement", requireAuth(), async (c) => {
  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }
  const userId = getUserId(c);
  const info = await getEntitlementInfo(userId);

  return c.json(
    {
      entitled: info.entitled,
      status: info.status,
      expiresAt: info.expiresAt,
      productId: info.productId,
      entitlement: info.entitlement,
    },
    200,
  );
});

const UpdateRcAppUserIdSchema = z.object({
  rcAppUserId: z.string().min(1),
});

/**
 * PUT /v1/me/rc-app-user-id
 * {rcAppUserId} -> users.rc_app_user_id を更新する(PLAN.md §4.4/§4.5 M5)。
 *
 * サインイン後に `Purchases.logIn(userId)` でRevenueCat側のエイリアス統合を行った直後、
 * モバイルからこのエンドポイントを呼び、サーバの users.rc_app_user_id を同期する。
 *
 * 更新後、その rc_app_user_id 宛に届いていた保留中のWebhookイベント
 * (pending_subscription_events)があれば再適用し、subscriptionsへ反映する
 * (lib/revenuecat.ts の applyPendingSubscriptionEvents)。
 *
 * 他ユーザーが既に同じ rc_app_user_id を使用している場合は409。
 */
meRoute.put("/v1/me/rc-app-user-id", requireAuth(), async (c) => {
  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }
  const userId = getUserId(c);

  const body = await c.req.json().catch(() => null);
  const parseResult = UpdateRcAppUserIdSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ error_kind: "invalid_request", message: "リクエストボディが不正です。" }, 400);
  }
  const { rcAppUserId } = parseResult.data;

  const db = await getDb();

  const existing = await db.select().from(users).where(eq(users.rcAppUserId, rcAppUserId)).limit(1);
  const existingUser = existing[0];
  if (existingUser && existingUser.id !== userId) {
    return c.json(
      { error_kind: "conflict", message: "このrcAppUserIdは別のユーザーに紐付けられています。" },
      409,
    );
  }

  await db.update(users).set({ rcAppUserId }).where(eq(users.id, userId));

  const appliedCount = await applyPendingSubscriptionEvents(db, userId, rcAppUserId);

  return c.json({ rcAppUserId, appliedPendingEvents: appliedCount }, 200);
});
