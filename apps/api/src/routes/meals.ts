/**
 * 食事記録API(PLAN.md §4.3 / §4.5 — M2/M3)。
 *
 * POST /v1/meals: analysisLogId + 編集後items を meals/meal_items に保存する。
 * GET  /v1/meals?date=YYYY-MM-DD: 指定日(Asia/Tokyo の DATE)のmealsを取得する。
 *
 * 認証: requireAuth()(自前JWT or devトークン)。user_idは認証済みユーザーのID。
 * DB未設定(DATABASE_URLなし・非テスト環境)の場合は503(DB機能未提供)を返す。
 */

import { Hono } from "hono";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, isDbConfigured } from "../db/client.js";
import { meals, mealItems } from "../db/schema.js";
import { getUserId, requireAuth } from "../lib/auth.js";

export const mealsRoute = new Hono();

const MealItemSchema = z.object({
  name: z.string().min(1),
  grams: z.number(),
  kcal: z.number(),
  protein_g: z.number(),
  fat_g: z.number(),
  carbs_g: z.number(),
  confidence: z.number(),
  corrected: z.boolean().optional().default(false),
  food_db_id: z.number().nullable().optional(),
  user_edited: z.boolean().optional().default(false),
  sort_order: z.number().optional(),
});

const CreateMealSchema = z.object({
  analysisLogId: z.number().nullable().optional(),
  eatenOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式で指定してください。"),
  eatenAt: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "HH:mm または HH:mm:ss形式で指定してください。"),
  mealType: z.enum(["breakfast", "lunch", "dinner", "snack", "unknown"]),
  source: z.enum(["photo", "text", "manual"]),
  items: z.array(MealItemSchema).min(1),
});

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
 * POST /v1/meals
 * {analysisLogId?, eatenOn, eatenAt, mealType, source, items[]} -> 作成されたmeal
 *
 * totalは items から再計算してmealsに保存する(クライアント送信値は信用しない)。
 */
mealsRoute.post("/v1/meals", requireAuth(), async (c) => {
  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }

  const userId = getUserId(c);

  const body = await c.req.json().catch(() => null);
  const parseResult = CreateMealSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      { error_kind: "invalid_request", message: "リクエストボディが不正です。" },
      400,
    );
  }
  const { analysisLogId, eatenOn, eatenAt, mealType, source, items } = parseResult.data;

  const total = items.reduce(
    (sum, item) => ({
      kcal: sum.kcal + item.kcal,
      protein_g: sum.protein_g + item.protein_g,
      fat_g: sum.fat_g + item.fat_g,
      carbs_g: sum.carbs_g + item.carbs_g,
    }),
    { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
  );

  const db = await getDb();

  const insertedMeal = await db
    .insert(meals)
    .values({
      userId,
      eatenOn,
      eatenAt,
      mealType,
      source,
      totalKcal: total.kcal,
      totalProteinG: total.protein_g,
      totalFatG: total.fat_g,
      totalCarbsG: total.carbs_g,
      analysisLogId: analysisLogId ?? null,
    })
    .returning();

  const mealRow = insertedMeal[0];
  if (!mealRow) {
    return c.json({ error_kind: "error", message: "meal作成に失敗しました。" }, 500);
  }

  const itemRows = items.map((item, index) => ({
    mealId: mealRow.id,
    name: item.name,
    grams: item.grams,
    kcal: item.kcal,
    proteinG: item.protein_g,
    fatG: item.fat_g,
    carbsG: item.carbs_g,
    confidence: item.confidence,
    corrected: item.corrected ?? false,
    foodDbId: item.food_db_id ?? null,
    userEdited: item.user_edited ?? false,
    sortOrder: item.sort_order ?? index,
  }));

  const insertedItems = await db.insert(mealItems).values(itemRows).returning();

  return c.json(
    {
      meal: mealRow,
      items: insertedItems,
    },
    201,
  );
});

/**
 * GET /v1/meals?date=YYYY-MM-DD
 * 指定日(Asia/Tokyo の DATE)に記録された meals + meal_items を返す。
 */
mealsRoute.get("/v1/meals", requireAuth(), async (c) => {
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

  const db = await getDb();

  const mealRows = await db
    .select()
    .from(meals)
    .where(and(eq(meals.userId, userId), eq(meals.eatenOn, dateParseResult.data)));

  const results = [];
  for (const meal of mealRows) {
    if (meal.deletedAt) {
      continue;
    }
    const items = await db.select().from(mealItems).where(eq(mealItems.mealId, meal.id));
    results.push({ meal, items });
  }

  return c.json({ meals: results }, 200);
});
