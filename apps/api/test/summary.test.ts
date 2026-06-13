/**
 * /v1/summary/daily, /v1/summary/weekly 統合テスト(M4)。
 *
 * - GET /v1/summary/daily: 当日のmeals合計 + その日に有効なgoal(effective_from<=date の最新)
 * - GET /v1/summary/weekly: 7日分の日別合計・平均PFC・目標達成率
 * - 複数日のmeals + goal履歴(effective_from変更)を跨ぐケースを検証する
 * - PATCH/DELETE後にsummaryへ反映されること(論理削除後はGETに出ない)も検証する
 */

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { _resetDbForTest, _setDbForTest, type Db } from "../src/db/client.js";
import { goals, users } from "../src/db/schema.js";
import { signAccessToken } from "../src/lib/jwt.js";
import { setupTestDb } from "./helpers/db.js";

const ORIGINAL_ENV = { ...process.env };

interface MealItemInput {
  name: string;
  grams: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  confidence: number;
}

async function createMeal(
  app: ReturnType<typeof createApp>,
  accessToken: string,
  input: {
    eatenOn: string;
    eatenAt: string;
    mealType: "breakfast" | "lunch" | "dinner" | "snack" | "unknown";
    source: "photo" | "text" | "manual";
    items: MealItemInput[];
  },
): Promise<{ meal: { id: number }; items: { id: number }[] }> {
  const res = await app.request("/v1/meals", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify(input),
  });
  expect(res.status).toBe(201);
  return (await res.json()) as { meal: { id: number }; items: { id: number }[] };
}

describe("/v1/summary", () => {
  let db: Db;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, DEV_TOKEN: "dev-secret", JWT_SECRET: "test-jwt-secret" };
    _setDbForTest(db);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    _resetDbForTest();
  });

  afterAll(async () => {
    const maybeClose = (db as unknown as { $client?: { close?: () => Promise<void> } }).$client;
    await maybeClose?.close?.();
  });

  it("GET /v1/summary/daily: meals合計とその日の有効goalを返す", async () => {
    const inserted = await db.insert(users).values({ email: "daily-user@example.com" }).returning();
    const userId = inserted[0]!.id;
    const accessToken = await signAccessToken(userId);

    // goal: 2026-06-01から有効
    await db.insert(goals).values({
      userId,
      goalType: "cut",
      weightKg: 70,
      heightCm: 175,
      age: 30,
      sex: "male",
      activityLevel: "moderate",
      targetKcal: 2000,
      targetProteinG: 140,
      targetFatG: 55,
      targetCarbsG: 200,
      effectiveFrom: "2026-06-01",
    });

    const app = createApp();

    // 2026-06-10に2件のmeal
    await createMeal(app, accessToken, {
      eatenOn: "2026-06-10",
      eatenAt: "08:00",
      mealType: "breakfast",
      source: "manual",
      items: [
        { name: "白米", grams: 150, kcal: 234, protein_g: 3.8, fat_g: 0.5, carbs_g: 53.4, confidence: 0.9 },
      ],
    });
    await createMeal(app, accessToken, {
      eatenOn: "2026-06-10",
      eatenAt: "12:30",
      mealType: "lunch",
      source: "manual",
      items: [
        { name: "鶏もも肉", grams: 100, kcal: 200, protein_g: 17, fat_g: 14, carbs_g: 0, confidence: 0.85 },
        { name: "サラダ", grams: 80, kcal: 30, protein_g: 1, fat_g: 0.2, carbs_g: 6, confidence: 0.8 },
      ],
    });

    const res = await app.request("/v1/summary/daily?date=2026-06-10", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      date: string;
      totals: { kcal: number; protein_g: number; fat_g: number; carbs_g: number };
      goal: { targetKcal: number; effectiveFrom: string } | null;
    };

    expect(body.date).toBe("2026-06-10");
    // 234 + 200 + 30 = 464
    expect(body.totals.kcal).toBeCloseTo(464, 5);
    expect(body.totals.protein_g).toBeCloseTo(3.8 + 17 + 1, 5);
    expect(body.goal?.targetKcal).toBe(2000);
    expect(body.goal?.effectiveFrom).toBe("2026-06-01");
  });

  it("GET /v1/summary/daily: 記録が無い日はtotalsが全て0、goalはeffective_from<=dateの最新", async () => {
    const inserted = await db.insert(users).values({ email: "daily-empty@example.com" }).returning();
    const userId = inserted[0]!.id;
    const accessToken = await signAccessToken(userId);

    // goal履歴: 2026-05-01 と 2026-06-01 の2件。2026-05-15時点では2026-05-01の方が有効。
    await db.insert(goals).values({
      userId,
      goalType: "maintain",
      weightKg: 65,
      heightCm: 170,
      age: 28,
      sex: "female",
      activityLevel: "light",
      targetKcal: 1800,
      targetProteinG: 100,
      targetFatG: 50,
      targetCarbsG: 220,
      effectiveFrom: "2026-05-01",
    });
    await db.insert(goals).values({
      userId,
      goalType: "cut",
      weightKg: 65,
      heightCm: 170,
      age: 28,
      sex: "female",
      activityLevel: "light",
      targetKcal: 1600,
      targetProteinG: 110,
      targetFatG: 45,
      targetCarbsG: 180,
      effectiveFrom: "2026-06-01",
    });

    const app = createApp();

    const resMay = await app.request("/v1/summary/daily?date=2026-05-15", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(resMay.status).toBe(200);
    const bodyMay = (await resMay.json()) as {
      totals: { kcal: number };
      goal: { targetKcal: number } | null;
    };
    expect(bodyMay.totals).toEqual({ kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });
    expect(bodyMay.goal?.targetKcal).toBe(1800);

    const resJune = await app.request("/v1/summary/daily?date=2026-06-15", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(resJune.status).toBe(200);
    const bodyJune = (await resJune.json()) as { goal: { targetKcal: number } | null };
    expect(bodyJune.goal?.targetKcal).toBe(1600);
  });

  it("GET /v1/summary/daily: 不正な日付形式は400、認証なしは401", async () => {
    const app = createApp();
    const res = await app.request("/v1/summary/daily?date=invalid", {
      headers: { Authorization: "Bearer dev-secret" },
    });
    expect(res.status).toBe(400);

    const resNoAuth = await app.request("/v1/summary/daily?date=2026-06-10");
    expect(resNoAuth.status).toBe(401);
  });

  it("GET /v1/summary/weekly: 7日分の日別合計・平均PFC・達成日数を返す(goal履歴をまたぐ)", async () => {
    const inserted = await db.insert(users).values({ email: "weekly-user@example.com" }).returning();
    const userId = inserted[0]!.id;
    const accessToken = await signAccessToken(userId);

    // goal履歴: 週の前半は2000kcal、週の後半(06-12〜)は2200kcalに変更
    await db.insert(goals).values({
      userId,
      goalType: "maintain",
      weightKg: 70,
      heightCm: 175,
      age: 30,
      sex: "male",
      activityLevel: "moderate",
      targetKcal: 2000,
      targetProteinG: 140,
      targetFatG: 55,
      targetCarbsG: 220,
      effectiveFrom: "2026-06-01",
    });
    await db.insert(goals).values({
      userId,
      goalType: "bulk",
      weightKg: 70,
      heightCm: 175,
      age: 30,
      sex: "male",
      activityLevel: "moderate",
      targetKcal: 2200,
      targetProteinG: 150,
      targetFatG: 60,
      targetCarbsG: 240,
      effectiveFrom: "2026-06-12",
    });

    const app = createApp();

    // start = 2026-06-08 (週: 06-08 ~ 06-14)
    // 06-09: 達成(kcal=2050圏内 P=145>=126)
    await createMeal(app, accessToken, {
      eatenOn: "2026-06-09",
      eatenAt: "12:00",
      mealType: "lunch",
      source: "manual",
      items: [
        { name: "A", grams: 100, kcal: 2050, protein_g: 145, fat_g: 55, carbs_g: 220, confidence: 0.9 },
      ],
    });

    // 06-12: goal切り替え後。kcal=2150 (2200の±10%=1980-2420圏内) P=135 (150*0.9=135 -> ちょうど達成)
    await createMeal(app, accessToken, {
      eatenOn: "2026-06-12",
      eatenAt: "19:00",
      mealType: "dinner",
      source: "manual",
      items: [
        { name: "B", grams: 100, kcal: 2150, protein_g: 135, fat_g: 60, carbs_g: 230, confidence: 0.9 },
      ],
    });

    // 06-13: 記録あるが未達成(kcalが大幅に超過)
    await createMeal(app, accessToken, {
      eatenOn: "2026-06-13",
      eatenAt: "19:00",
      mealType: "dinner",
      source: "manual",
      items: [
        { name: "C", grams: 100, kcal: 3000, protein_g: 100, fat_g: 100, carbs_g: 300, confidence: 0.9 },
      ],
    });

    const res = await app.request("/v1/summary/weekly?start=2026-06-08", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      start: string;
      days: { date: string; achieved: boolean; totals: { kcal: number } | null; goal: { targetKcal: number } | null }[];
      averages: { kcal: number; protein_g: number };
      achievedDays: number;
      recordedDays: number;
    };

    expect(body.start).toBe("2026-06-08");
    expect(body.days).toHaveLength(7);

    const day09 = body.days.find((d) => d.date === "2026-06-09");
    expect(day09?.totals?.kcal).toBeCloseTo(2050, 5);
    expect(day09?.goal?.targetKcal).toBe(2000);
    expect(day09?.achieved).toBe(true);

    const day12 = body.days.find((d) => d.date === "2026-06-12");
    expect(day12?.goal?.targetKcal).toBe(2200); // goal切り替え後
    expect(day12?.achieved).toBe(true);

    const day13 = body.days.find((d) => d.date === "2026-06-13");
    expect(day13?.achieved).toBe(false);

    const day08 = body.days.find((d) => d.date === "2026-06-08");
    expect(day08?.totals).toBeNull();

    expect(body.recordedDays).toBe(3);
    expect(body.achievedDays).toBe(2);
    // 平均kcal = (2050 + 2150 + 3000) / 3
    expect(body.averages.kcal).toBeCloseTo((2050 + 2150 + 3000) / 3, 5);
  });

  it("PATCH/DELETE後にsummaryへ反映される(論理削除後は合計から消える)", async () => {
    const inserted = await db.insert(users).values({ email: "summary-patch-user@example.com" }).returning();
    const userId = inserted[0]!.id;
    const accessToken = await signAccessToken(userId);

    const app = createApp();

    const created1 = await createMeal(app, accessToken, {
      eatenOn: "2026-06-20",
      eatenAt: "08:00",
      mealType: "breakfast",
      source: "manual",
      items: [
        { name: "白米", grams: 150, kcal: 234, protein_g: 3.8, fat_g: 0.5, carbs_g: 53.4, confidence: 0.9 },
      ],
    });
    const created2 = await createMeal(app, accessToken, {
      eatenOn: "2026-06-20",
      eatenAt: "12:30",
      mealType: "lunch",
      source: "manual",
      items: [
        { name: "鶏もも肉", grams: 100, kcal: 200, protein_g: 17, fat_g: 14, carbs_g: 0, confidence: 0.85 },
      ],
    });

    const beforeRes = await app.request("/v1/summary/daily?date=2026-06-20", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const beforeBody = (await beforeRes.json()) as { totals: { kcal: number } };
    expect(beforeBody.totals.kcal).toBeCloseTo(234 + 200, 5);

    // PATCH: created1のitemsを差し替え (kcal: 234 -> 300)
    const patchRes = await app.request(`/v1/meals/${created1.meal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        items: [
          { name: "白米(大盛り)", grams: 200, kcal: 300, protein_g: 5, fat_g: 0.6, carbs_g: 68, confidence: 0.9 },
        ],
      }),
    });
    expect(patchRes.status).toBe(200);
    const patchBody = (await patchRes.json()) as {
      meal: { totalKcal: number };
      items: { name: string; grams: number }[];
    };
    expect(patchBody.meal.totalKcal).toBeCloseTo(300, 5);
    expect(patchBody.items).toHaveLength(1);
    expect(patchBody.items[0]?.name).toBe("白米(大盛り)");

    const afterPatchRes = await app.request("/v1/summary/daily?date=2026-06-20", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const afterPatchBody = (await afterPatchRes.json()) as { totals: { kcal: number } };
    // 300 + 200 = 500
    expect(afterPatchBody.totals.kcal).toBeCloseTo(500, 5);

    // DELETE: created2を論理削除
    const deleteRes = await app.request(`/v1/meals/${created2.meal.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(deleteRes.status).toBe(200);

    const afterDeleteRes = await app.request("/v1/summary/daily?date=2026-06-20", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const afterDeleteBody = (await afterDeleteRes.json()) as { totals: { kcal: number } };
    // 300のみ
    expect(afterDeleteBody.totals.kcal).toBeCloseTo(300, 5);

    // GET /v1/meals?date= にも論理削除済みのmealは出ない
    const mealsRes = await app.request("/v1/meals?date=2026-06-20", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const mealsBody = (await mealsRes.json()) as { meals: { meal: { id: number } }[] };
    expect(mealsBody.meals).toHaveLength(1);
    expect(mealsBody.meals[0]?.meal.id).toBe(created1.meal.id);

    // GET /v1/meals/:id (論理削除済み) は404
    const getDeletedRes = await app.request(`/v1/meals/${created2.meal.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(getDeletedRes.status).toBe(404);
  });
});
