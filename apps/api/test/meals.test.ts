/**
 * /v1/meals 統合テスト + analysis_logs レート制限カウント(M2)。
 *
 * (d) POST /v1/meals で保存 -> GET /v1/meals?date= で取得できることを検証する。
 * (e) countTodayAnalyses(当日カウント、Asia/Tokyo基準、status!='error')を検証する。
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { _resetDbForTest, _setDbForTest, type Db } from "../src/db/client.js";
import { users } from "../src/db/schema.js";
import { DEV_USER_ID } from "../src/db/seed.js";
import { countTodayAnalyses, recordAnalysisLog, tokyoDayRangeUtc } from "../src/lib/analysis-logs.js";
import { signAccessToken } from "../src/lib/jwt.js";
import { setupTestDb } from "./helpers/db.js";

const ORIGINAL_ENV = { ...process.env };

describe("/v1/meals", () => {
  let db: Db;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, DEV_TOKEN: "dev-secret" };
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

  it("(d) POST /v1/meals で保存した食事をGET /v1/meals?date=で取得できる", async () => {
    const app = createApp();

    const createRes = await app.request("/v1/meals", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer dev-secret",
      },
      body: JSON.stringify({
        eatenOn: "2026-06-12",
        eatenAt: "12:30",
        mealType: "lunch",
        source: "manual",
        items: [
          {
            name: "精白米めし",
            grams: 150,
            kcal: 234,
            protein_g: 3.75,
            fat_g: 0.45,
            carbs_g: 53.4,
            confidence: 0.9,
            corrected: true,
          },
          {
            name: "鶏もも肉 皮なし",
            grams: 100,
            kcal: 113,
            protein_g: 19.0,
            fat_g: 5.0,
            carbs_g: 0,
            confidence: 0.85,
            corrected: true,
          },
        ],
      }),
    });

    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as {
      meal: { id: number; userId: string; eatenOn: string; totalKcal: number };
      items: { id: number; name: string }[];
    };
    expect(created.meal.userId).toBe(DEV_USER_ID);
    expect(created.meal.eatenOn).toBe("2026-06-12");
    // total kcal = 234 + 113 = 347
    expect(created.meal.totalKcal).toBeCloseTo(347, 5);
    expect(created.items).toHaveLength(2);

    const getRes = await app.request("/v1/meals?date=2026-06-12", {
      headers: { Authorization: "Bearer dev-secret" },
    });
    expect(getRes.status).toBe(200);
    const body = (await getRes.json()) as {
      meals: { meal: { id: number; eatenOn: string }; items: { name: string }[] }[];
    };
    expect(body.meals).toHaveLength(1);
    expect(body.meals[0]?.meal.eatenOn).toBe("2026-06-12");
    expect(body.meals[0]?.items.map((i) => i.name).sort()).toEqual(
      ["精白米めし", "鶏もも肉 皮なし"].sort(),
    );
  });

  it("GET /v1/meals?date= で該当日にデータがない場合は空配列を返す", async () => {
    const app = createApp();
    const res = await app.request("/v1/meals?date=2020-01-01", {
      headers: { Authorization: "Bearer dev-secret" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { meals: unknown[] };
    expect(body.meals).toEqual([]);
  });

  it("GET /v1/meals?date= 不正な日付形式は400", async () => {
    const app = createApp();
    const res = await app.request("/v1/meals?date=not-a-date", {
      headers: { Authorization: "Bearer dev-secret" },
    });
    expect(res.status).toBe(400);
  });

  it("認証なしでPOST /v1/mealsは401", async () => {
    const app = createApp();
    const res = await app.request("/v1/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });
});

describe("PATCH/DELETE /v1/meals/:id", () => {
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

  async function createSampleMeal(
    app: ReturnType<typeof createApp>,
    accessToken: string,
    eatenOn = "2026-06-15",
  ) {
    const res = await app.request("/v1/meals", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        eatenOn,
        eatenAt: "12:30",
        mealType: "lunch",
        source: "manual",
        items: [
          {
            name: "精白米めし",
            grams: 150,
            kcal: 234,
            protein_g: 3.75,
            fat_g: 0.45,
            carbs_g: 53.4,
            confidence: 0.9,
            corrected: true,
          },
        ],
      }),
    });
    expect(res.status).toBe(201);
    return (await res.json()) as { meal: { id: number }; items: { id: number; name: string }[] };
  }

  it("PATCH /v1/meals/:id: itemsを差し替えるとtotalsが再計算される", async () => {
    const app = createApp();
    const created = await createSampleMeal(app, "dev-secret", "2026-06-15");

    const res = await app.request(`/v1/meals/${created.meal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer dev-secret" },
      body: JSON.stringify({
        items: [
          {
            name: "白米(大盛り)",
            grams: 250,
            kcal: 390,
            protein_g: 6.25,
            fat_g: 0.75,
            carbs_g: 89,
            confidence: 0.9,
          },
          {
            name: "味噌汁",
            grams: 180,
            kcal: 40,
            protein_g: 3,
            fat_g: 1,
            carbs_g: 5,
            confidence: 0.8,
          },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      meal: { id: number; totalKcal: number; totalProteinG: number };
      items: { name: string }[];
    };
    expect(body.meal.totalKcal).toBeCloseTo(390 + 40, 5);
    expect(body.meal.totalProteinG).toBeCloseTo(6.25 + 3, 5);
    expect(body.items.map((i) => i.name).sort()).toEqual(["味噌汁", "白米(大盛り)"].sort());
  });

  it("PATCH /v1/meals/:id: mealType/eatenAtのみ変更してitemsは保持される", async () => {
    const app = createApp();
    const created = await createSampleMeal(app, "dev-secret", "2026-06-16");

    const res = await app.request(`/v1/meals/${created.meal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer dev-secret" },
      body: JSON.stringify({ mealType: "dinner", eatenAt: "19:00" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      meal: { mealType: string; eatenAt: string; totalKcal: number };
      items: { name: string }[];
    };
    expect(body.meal.mealType).toBe("dinner");
    expect(body.meal.eatenAt).toBe("19:00:00");
    expect(body.meal.totalKcal).toBeCloseTo(234, 5);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.name).toBe("精白米めし");
  });

  it("DELETE /v1/meals/:id: 論理削除後はGET /v1/meals?date=に出ない", async () => {
    const app = createApp();
    const created = await createSampleMeal(app, "dev-secret", "2026-06-17");

    const deleteRes = await app.request(`/v1/meals/${created.meal.id}`, {
      method: "DELETE",
      headers: { Authorization: "Bearer dev-secret" },
    });
    expect(deleteRes.status).toBe(200);
    expect(await deleteRes.json()).toEqual({ ok: true });

    const getRes = await app.request("/v1/meals?date=2026-06-17", {
      headers: { Authorization: "Bearer dev-secret" },
    });
    const getBody = (await getRes.json()) as { meals: unknown[] };
    expect(getBody.meals).toEqual([]);

    const getByIdRes = await app.request(`/v1/meals/${created.meal.id}`, {
      headers: { Authorization: "Bearer dev-secret" },
    });
    expect(getByIdRes.status).toBe(404);
  });

  it("PATCH /v1/meals/:id: 他ユーザーのmealは404", async () => {
    const app = createApp();
    const created = await createSampleMeal(app, "dev-secret");

    const otherUser = await db.insert(users).values({ email: "other-user@example.com" }).returning();
    const otherAccessToken = await signAccessToken(otherUser[0]!.id);

    const res = await app.request(`/v1/meals/${created.meal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${otherAccessToken}` },
      body: JSON.stringify({ mealType: "snack" }),
    });
    expect(res.status).toBe(404);
  });

  it("DELETE /v1/meals/:id: 他ユーザーのmealは404、存在しないidも404", async () => {
    const app = createApp();
    const created = await createSampleMeal(app, "dev-secret");

    const otherUser = await db.insert(users).values({ email: "other-user-2@example.com" }).returning();
    const otherAccessToken = await signAccessToken(otherUser[0]!.id);

    const res = await app.request(`/v1/meals/${created.meal.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${otherAccessToken}` },
    });
    expect(res.status).toBe(404);

    const resMissing = await app.request("/v1/meals/999999999", {
      method: "DELETE",
      headers: { Authorization: "Bearer dev-secret" },
    });
    expect(resMissing.status).toBe(404);
  });

  it("PATCH /v1/meals/:id: 不正なid・空ボディは400、認証なしは401", async () => {
    const app = createApp();
    const created = await createSampleMeal(app, "dev-secret");

    const resBadId = await app.request("/v1/meals/not-a-number", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer dev-secret" },
      body: JSON.stringify({ mealType: "snack" }),
    });
    expect(resBadId.status).toBe(400);

    const resEmptyBody = await app.request(`/v1/meals/${created.meal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer dev-secret" },
      body: JSON.stringify({}),
    });
    expect(resEmptyBody.status).toBe(400);

    const resNoAuth = await app.request(`/v1/meals/${created.meal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mealType: "snack" }),
    });
    expect(resNoAuth.status).toBe(401);
  });
});

describe("countTodayAnalyses (レート制限の下地)", () => {
  let db: Db;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  afterAll(async () => {
    const maybeClose = (db as unknown as { $client?: { close?: () => Promise<void> } }).$client;
    await maybeClose?.close?.();
  });

  const usage = {
    input_tokens: 100,
    output_tokens: 50,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };

  it("(e) 当日(Asia/Tokyo基準)のstatus!='error'のログ件数を返す", async () => {
    // analysis_logs.created_at は defaultNow() (DB実行時の現在時刻) で記録されるため、
    // countTodayAnalyses に渡す now() も実際の現在時刻を使う。
    const now = new Date();
    const before = await countTodayAnalyses(db, DEV_USER_ID, now);

    // 当日分(ok, not_food)を2件、当日分のerrorを1件記録
    await recordAnalysisLog(db, {
      userId: DEV_USER_ID,
      model: "claude-haiku-4-5",
      escalated: false,
      flagged: false,
      usage,
      latencyMs: 1000,
      status: "ok",
    });
    await recordAnalysisLog(db, {
      userId: DEV_USER_ID,
      model: "claude-haiku-4-5",
      escalated: false,
      flagged: false,
      usage,
      latencyMs: 1200,
      status: "not_food",
    });
    await recordAnalysisLog(db, {
      userId: DEV_USER_ID,
      model: "claude-haiku-4-5",
      escalated: false,
      flagged: false,
      usage,
      latencyMs: 800,
      status: "error",
    });

    const after = await countTodayAnalyses(db, DEV_USER_ID, now);
    // error は除外され、ok + not_food の2件分だけ増加する
    expect(after - before).toBe(2);
  });

  it("tokyoDayRangeUtc: Asia/Tokyoの日付境界をUTCで正しく返す", () => {
    // 2026-06-12T03:00:00Z = Asia/Tokyo 2026-06-12 12:00
    const now = new Date("2026-06-12T03:00:00.000Z");
    const { start, end } = tokyoDayRangeUtc(now);
    // Asia/Tokyo 2026-06-12 00:00 = UTC 2026-06-11 15:00
    expect(start.toISOString()).toBe("2026-06-11T15:00:00.000Z");
    // 翌日0時(排他的上限) = UTC 2026-06-12 15:00
    expect(end.toISOString()).toBe("2026-06-12T15:00:00.000Z");
  });
});
