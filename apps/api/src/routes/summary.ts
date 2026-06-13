/**
 * サマリーAPI(PLAN.md §4.3 / §4.5 M4)。
 *
 * - GET /v1/summary/daily?date=YYYY-MM-DD
 *     当日のmeals合計(kcal/P/F/C) + その日に有効なgoal(effective_from<=date の最新)
 * - GET /v1/summary/weekly?start=YYYY-MM-DD
 *     7日分の日別合計・平均PFC・目標達成率(sharedのweekly-summaryで判定)
 *
 * 認証: requireAuth()(自前JWT or devトークン)。
 * DB未設定(DATABASE_URLなし・非テスト環境)の場合は503を返す。
 */

import { Hono } from "hono";
import { and, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { summarizeWeek, weekDateRange, type DailyGoalTargets, type DailyTotals } from "@pashacaro/shared";
import { getDb, isDbConfigured, type Db } from "../db/client.js";
import { goals, meals } from "../db/schema.js";
import { getUserId, requireAuth } from "../lib/auth.js";

export const summaryRoute = new Hono();

const DATE_QUERY_SCHEMA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

function dbUnavailableResponse(c: import("hono").Context) {
  return c.json(
    {
      error_kind: "db_unavailable",
      message: "DBが設定されていません。DATABASE_URLを設定してください。",
    },
    503,
  );
}

/**
 * 指定日(Asia/Tokyo の DATE文字列)の meals(deleted_atなし)を合計してDailyTotalsを返す。
 * 記録が1件もない場合はnullを返す。
 */
async function getDailyTotals(db: Db, userId: string, date: string): Promise<DailyTotals | null> {
  const mealRows = await db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.eatenOn, date)));

  const activeMeals = mealRows.filter((m) => !m.deletedAt);
  if (activeMeals.length === 0) {
    return null;
  }

  return activeMeals.reduce<DailyTotals>(
    (sum, m) => ({
      kcal: sum.kcal + m.totalKcal,
      protein_g: sum.protein_g + m.totalProteinG,
      fat_g: sum.fat_g + m.totalFatG,
      carbs_g: sum.carbs_g + m.totalCarbsG,
    }),
    { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
  );
}

/**
 * 指定日(Asia/Tokyo の DATE文字列)時点で有効な目標(effective_from<=date の最新)を返す。
 * 未設定の場合はnull。
 */
async function getEffectiveGoal(
  db: Db,
  userId: string,
  date: string,
): Promise<(typeof goals.$inferSelect) | null> {
  const rows = await db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), lte(goals.effectiveFrom, date)))
    .orderBy(desc(goals.effectiveFrom), desc(goals.id))
    .limit(1);

  return rows[0] ?? null;
}

function toGoalTargets(goal: typeof goals.$inferSelect | null): DailyGoalTargets | null {
  if (!goal) return null;
  return {
    targetKcal: goal.targetKcal,
    targetProteinG: goal.targetProteinG,
    targetFatG: goal.targetFatG,
    targetCarbsG: goal.targetCarbsG,
  };
}

/**
 * GET /v1/summary/daily?date=YYYY-MM-DD
 * -> { date, totals: DailyTotals, goal: GoalRow | null }
 *
 * totals は記録が無い場合も {kcal:0, protein_g:0, fat_g:0, carbs_g:0} を返す
 * (ホームのリングは常に0表示できるようにする)。
 */
summaryRoute.get("/v1/summary/daily", requireAuth(), async (c) => {
  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }
  const userId = getUserId(c);

  const date = c.req.query("date");
  const dateParseResult = DATE_QUERY_SCHEMA.safeParse(date);
  if (!dateParseResult.success) {
    return c.json(
      { error_kind: "invalid_request", message: "dateクエリパラメータをYYYY-MM-DD形式で指定してください。" },
      400,
    );
  }
  const targetDate = dateParseResult.data;

  const db = await getDb();

  const totals = (await getDailyTotals(db, userId, targetDate)) ?? {
    kcal: 0,
    protein_g: 0,
    fat_g: 0,
    carbs_g: 0,
  };
  const goal = await getEffectiveGoal(db, userId, targetDate);

  return c.json(
    {
      date: targetDate,
      totals,
      goal,
    },
    200,
  );
});

/**
 * GET /v1/summary/weekly?start=YYYY-MM-DD
 * -> { start, days: DaySummaryResult[], averages: DailyTotals, achievedDays, recordedDays }
 *
 * start から7日分(start含む)を対象に、各日のmeals合計とその日時点の有効goalを集計し、
 * sharedの summarizeWeek で達成判定・平均PFC・達成日数を計算する。
 */
summaryRoute.get("/v1/summary/weekly", requireAuth(), async (c) => {
  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }
  const userId = getUserId(c);

  const start = c.req.query("start");
  const startParseResult = DATE_QUERY_SCHEMA.safeParse(start);
  if (!startParseResult.success) {
    return c.json(
      { error_kind: "invalid_request", message: "startクエリパラメータをYYYY-MM-DD形式で指定してください。" },
      400,
    );
  }
  const startDate = startParseResult.data;

  const db = await getDb();

  const dates = weekDateRange(startDate);

  const dayInputs = await Promise.all(
    dates.map(async (date) => {
      const [totals, goal] = await Promise.all([
        getDailyTotals(db, userId, date),
        getEffectiveGoal(db, userId, date),
      ]);
      return { date, totals, goal: toGoalTargets(goal) };
    }),
  );

  const result = summarizeWeek(dayInputs);

  return c.json(
    {
      start: startDate,
      days: result.days,
      averages: result.averages,
      achievedDays: result.achievedDays,
      recordedDays: result.recordedDays,
    },
    200,
  );
});
