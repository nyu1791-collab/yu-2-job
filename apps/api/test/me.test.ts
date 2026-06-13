/**
 * /v1/me, /v1/me/goal 統合テスト(M3)。
 *
 * - devトークンでdevユーザーのプロフィールを取得できる
 * - JWT認証でユーザー固有のプロフィール/目標を取得・更新できる
 * - PUT /v1/me/goal はsharedのgoal-calcでtarget_kcal/P/F/Cを計算し、新しいgoals行をinsertする(履歴保持)
 * - 認証なしは401
 */

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { calculateGoal, recalculatePfcForKcal } from "@pashacaro/shared";
import { createApp } from "../src/app.js";
import { _resetDbForTest, _setDbForTest, type Db } from "../src/db/client.js";
import { DEV_USER_ID } from "../src/db/seed.js";
import { signAccessToken } from "../src/lib/jwt.js";
import { goals, users } from "../src/db/schema.js";
import { setupTestDb } from "./helpers/db.js";

const ORIGINAL_ENV = { ...process.env };

describe("/v1/me", () => {
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

  it("devトークンでGET /v1/me -> devユーザーを返す", async () => {
    const app = createApp();
    const res = await app.request("/v1/me", {
      headers: { Authorization: "Bearer dev-secret" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; displayName: string | null };
    expect(body.id).toBe(DEV_USER_ID);
    expect(body.displayName).toBe("Dev User");
  });

  it("認証なしでGET /v1/meは401", async () => {
    const app = createApp();
    const res = await app.request("/v1/me");
    expect(res.status).toBe(401);
  });

  it("JWTでGET/PUT /v1/me -> プロフィールの取得・更新ができる", async () => {
    // 新規ユーザーを作成
    const inserted = await db.insert(users).values({ email: "jwt-user@example.com" }).returning();
    const userId = inserted[0]!.id;
    const accessToken = await signAccessToken(userId);

    const app = createApp();

    const getRes = await app.request("/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { id: string; email: string | null; displayName: string | null };
    expect(getBody.id).toBe(userId);
    expect(getBody.email).toBe("jwt-user@example.com");
    expect(getBody.displayName).toBeNull();

    const putRes = await app.request("/v1/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ displayName: "テストユーザー" }),
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { displayName: string | null };
    expect(putBody.displayName).toBe("テストユーザー");

    // 再取得しても反映されている
    const getRes2 = await app.request("/v1/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const getBody2 = (await getRes2.json()) as { displayName: string | null };
    expect(getBody2.displayName).toBe("テストユーザー");
  });
});

describe("/v1/me/goal", () => {
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

  it("GET /v1/me/goal: 未設定の場合は404", async () => {
    const inserted = await db.insert(users).values({ email: "no-goal@example.com" }).returning();
    const userId = inserted[0]!.id;
    const accessToken = await signAccessToken(userId);

    const app = createApp();
    const res = await app.request("/v1/me/goal", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.status).toBe(404);
  });

  it("PUT /v1/me/goal: goal-calcで計算したtarget_kcal/P/F/Cを保存し、GETで取得できる", async () => {
    const inserted = await db.insert(users).values({ email: "goal-user@example.com" }).returning();
    const userId = inserted[0]!.id;
    const accessToken = await signAccessToken(userId);

    const input = {
      goalType: "cut" as const,
      weightKg: 70,
      heightCm: 175,
      age: 30,
      sex: "male" as const,
      activityLevel: "moderate" as const,
    };

    const expected = calculateGoal(input);

    const app = createApp();
    const putRes = await app.request("/v1/me/goal", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(input),
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as {
      goal: { targetKcal: number; targetProteinG: number; targetFatG: number; targetCarbsG: number };
    };
    expect(putBody.goal.targetKcal).toBeCloseTo(expected.targetKcal, 5);
    expect(putBody.goal.targetProteinG).toBeCloseTo(expected.targetProteinG, 5);
    expect(putBody.goal.targetFatG).toBeCloseTo(expected.targetFatG, 5);
    expect(putBody.goal.targetCarbsG).toBeCloseTo(expected.targetCarbsG, 5);

    const getRes = await app.request("/v1/me/goal", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as { goal: { goalType: string; targetKcal: number } };
    expect(getBody.goal.goalType).toBe("cut");
    expect(getBody.goal.targetKcal).toBeCloseTo(expected.targetKcal, 5);
  });

  it("PUT /v1/me/goal: targetKcalOverride指定時はPを固定してF/Cを再計算して保存する(オンボーディングのkcal微調整)", async () => {
    const inserted = await db.insert(users).values({ email: "goal-override@example.com" }).returning();
    const userId = inserted[0]!.id;
    const accessToken = await signAccessToken(userId);

    const input = {
      goalType: "cut" as const,
      weightKg: 70,
      heightCm: 175,
      age: 30,
      sex: "male" as const,
      activityLevel: "moderate" as const,
    };

    const base = calculateGoal(input);
    const overrideKcal = base.targetKcal + 50;
    const expected = recalculatePfcForKcal({ targetKcal: overrideKcal, proteinG: base.targetProteinG });

    const app = createApp();
    const putRes = await app.request("/v1/me/goal", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ ...input, targetKcalOverride: overrideKcal }),
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as {
      goal: { targetKcal: number; targetProteinG: number; targetFatG: number; targetCarbsG: number };
    };
    expect(putBody.goal.targetKcal).toBeCloseTo(overrideKcal, 5);
    expect(putBody.goal.targetProteinG).toBeCloseTo(base.targetProteinG, 5);
    expect(putBody.goal.targetFatG).toBeCloseTo(expected.targetFatG, 5);
    expect(putBody.goal.targetCarbsG).toBeCloseTo(expected.targetCarbsG, 5);
  });

  it("PUT /v1/me/goal を2回呼ぶと、GETは最新(2回目)の目標を返す(履歴保持)", async () => {
    const inserted = await db.insert(users).values({ email: "goal-history@example.com" }).returning();
    const userId = inserted[0]!.id;
    const accessToken = await signAccessToken(userId);

    const app = createApp();

    await app.request("/v1/me/goal", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        goalType: "maintain",
        weightKg: 60,
        heightCm: 165,
        age: 25,
        sex: "female",
        activityLevel: "light",
      }),
    });

    await app.request("/v1/me/goal", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({
        goalType: "bulk",
        weightKg: 62,
        heightCm: 165,
        age: 25,
        sex: "female",
        activityLevel: "active",
      }),
    });

    const getRes = await app.request("/v1/me/goal", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const getBody = (await getRes.json()) as { goal: { goalType: string; weightKg: number } };
    expect(getBody.goal.goalType).toBe("bulk");
    expect(getBody.goal.weightKg).toBeCloseTo(62, 5);

    // 履歴は2行存在する
    const allGoalsRes = await db.select().from(goals).where(eq(goals.userId, userId));
    expect(allGoalsRes).toHaveLength(2);
  });

  it("認証なしでGET /v1/me/goalは401", async () => {
    const app = createApp();
    const res = await app.request("/v1/me/goal");
    expect(res.status).toBe(401);
  });

  it("PUT /v1/me/goal: 不正なリクエストボディは400", async () => {
    const inserted = await db.insert(users).values({ email: "invalid-goal@example.com" }).returning();
    const userId = inserted[0]!.id;
    const accessToken = await signAccessToken(userId);

    const app = createApp();
    const res = await app.request("/v1/me/goal", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ goalType: "invalid" }),
    });
    expect(res.status).toBe(400);
  });
});
