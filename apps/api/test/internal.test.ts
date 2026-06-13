/**
 * GET /v1/internal/cost-report 統合テスト(M6)。
 *
 * - Authorizationヘッダの共有シークレット検証(誤シークレット->401, 未設定->500)
 * - 指定日(Asia/Tokyo)のanalysis_logsを集計し、総コスト・per-user上位・
 *   escalation率・status別件数・parse_failed率を返す
 * - 総コストが$20を超える場合はalert:trueになる
 * - 指定日以外のログは集計対象外
 */

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { _resetDbForTest, _setDbForTest, type Db } from "../src/db/client.js";
import { analysisLogs, users } from "../src/db/schema.js";
import { setupTestDb } from "./helpers/db.js";

const ORIGINAL_ENV = { ...process.env };
const CRON_SECRET = "test-internal-cron-secret";
const TARGET_DATE = "2026-06-10";

/** Asia/Tokyo の TARGET_DATE 12:00 に相当するUTC時刻(対象日内)。 */
const WITHIN_TARGET_DAY = new Date("2026-06-10T03:00:00.000Z");
/** TARGET_DATEの前日(対象外)。 */
const BEFORE_TARGET_DAY = new Date("2026-06-09T03:00:00.000Z");
/** TARGET_DATEの翌日(対象外)。 */
const AFTER_TARGET_DAY = new Date("2026-06-11T03:00:00.000Z");

async function getReport(app: ReturnType<typeof createApp>, query = "", secret = CRON_SECRET) {
  const headers: Record<string, string> = {};
  if (secret) {
    headers["Authorization"] = `Bearer ${secret}`;
  }
  return app.request(`/v1/internal/cost-report${query}`, { headers });
}

describe("GET /v1/internal/cost-report", () => {
  let db: Db;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    db = await setupTestDb();

    const inserted = await db
      .insert(users)
      .values([
        { email: "cost-report-user-a@example.com" },
        { email: "cost-report-user-b@example.com" },
      ])
      .returning();
    userA = inserted[0]!.id;
    userB = inserted[1]!.id;
  });

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, INTERNAL_CRON_SECRET: CRON_SECRET, JWT_SECRET: "test-jwt-secret" };
    _setDbForTest(db);
  });

  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    _resetDbForTest();
    await db.delete(analysisLogs).where(eq(analysisLogs.userId, userA));
    await db.delete(analysisLogs).where(eq(analysisLogs.userId, userB));
  });

  afterAll(async () => {
    const maybeClose = (db as unknown as { $client?: { close?: () => Promise<void> } }).$client;
    await maybeClose?.close?.();
  });

  it("誤った共有シークレットは401", async () => {
    const app = createApp();
    const res = await getReport(app, `?date=${TARGET_DATE}`, "wrong-secret");
    expect(res.status).toBe(401);
  });

  it("Authorizationヘッダーが無い場合は401", async () => {
    const app = createApp();
    const res = await app.request(`/v1/internal/cost-report?date=${TARGET_DATE}`);
    expect(res.status).toBe(401);
  });

  it("INTERNAL_CRON_SECRET未設定時は500", async () => {
    delete process.env["INTERNAL_CRON_SECRET"];
    const app = createApp();
    const res = await getReport(app, `?date=${TARGET_DATE}`);
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error_kind: string };
    expect(body.error_kind).toBe("config_error");
  });

  it("dateが不正な形式の場合は400", async () => {
    const app = createApp();
    const res = await getReport(app, "?date=not-a-date");
    expect(res.status).toBe(400);
  });

  it("対象日のanalysis_logsを集計し、コスト・件数・escalation率・status別件数を返す", async () => {
    await db.insert(analysisLogs).values([
      {
        userId: userA,
        model: "claude-haiku-4-5",
        escalated: false,
        flagged: false,
        inputTokens: 5000,
        outputTokens: 600,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        status: "ok",
        createdAt: WITHIN_TARGET_DAY,
      },
      {
        userId: userA,
        model: "claude-sonnet-4-6",
        escalated: true,
        flagged: false,
        inputTokens: 5000,
        outputTokens: 600,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        status: "ok",
        createdAt: WITHIN_TARGET_DAY,
      },
      {
        userId: userB,
        model: "claude-haiku-4-5",
        escalated: false,
        flagged: false,
        inputTokens: 1000,
        outputTokens: 0,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        status: "parse_failed",
        createdAt: WITHIN_TARGET_DAY,
      },
      // 対象日外(前日・翌日)のログは集計対象外
      {
        userId: userA,
        model: "claude-haiku-4-5",
        escalated: false,
        flagged: false,
        inputTokens: 9999,
        outputTokens: 9999,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        status: "ok",
        createdAt: BEFORE_TARGET_DAY,
      },
      {
        userId: userA,
        model: "claude-haiku-4-5",
        escalated: false,
        flagged: false,
        inputTokens: 9999,
        outputTokens: 9999,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
        status: "ok",
        createdAt: AFTER_TARGET_DAY,
      },
    ]);

    const app = createApp();
    const res = await getReport(app, `?date=${TARGET_DATE}`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      date: string;
      totalCount: number;
      totalCostUsd: number;
      escalatedCount: number;
      escalationRate: number;
      statusCounts: Record<string, number>;
      parseFailedRate: number;
      topUsers: { userId: string; costUsd: number; count: number }[];
      alert: boolean;
    };

    expect(body.date).toBe(TARGET_DATE);
    expect(body.totalCount).toBe(3);
    expect(body.escalatedCount).toBe(1);
    expect(body.escalationRate).toBeCloseTo(1 / 3, 10);
    expect(body.statusCounts["ok"]).toBe(2);
    expect(body.statusCounts["parse_failed"]).toBe(1);
    expect(body.parseFailedRate).toBeCloseTo(1 / 3, 10);
    expect(body.alert).toBe(false);

    // userAは2件(haiku + sonnet)、userBは1件(haiku)。userAの合計コストの方が高い。
    expect(body.topUsers[0]!.userId).toBe(userA);
    expect(body.topUsers[0]!.count).toBe(2);
    expect(body.topUsers[1]!.userId).toBe(userB);
    expect(body.topUsers[1]!.count).toBe(1);

    // haiku(5000in/600out) + sonnet(5000in/600out) = userAのコスト
    const haikuCost = (5000 / 1_000_000) * 1.0 + (600 / 1_000_000) * 5.0;
    const sonnetCost = (5000 / 1_000_000) * 3.0 + (600 / 1_000_000) * 15.0;
    const userBCost = (1000 / 1_000_000) * 1.0;
    expect(body.topUsers[0]!.costUsd).toBeCloseTo(haikuCost + sonnetCost, 10);
    expect(body.totalCostUsd).toBeCloseTo(haikuCost + sonnetCost + userBCost, 10);
  });

  it("dateを省略した場合は本日(Asia/Tokyo)を対象にする(0件でも200)", async () => {
    const app = createApp();
    const res = await getReport(app);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { date: string; totalCount: number };
    expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.totalCount).toBeGreaterThanOrEqual(0);
  });

  it("総コストが$20を超える場合はalert:trueになる", async () => {
    // claude-sonnet-4-6: 入力$3/1M, 出力$15/1M。
    // 1,000,000 input + 100,000 output ≈ $3 + $1.5 = $4.5/件。5件で$22.5 > $20。
    const rows = Array.from({ length: 5 }, () => ({
      userId: userA,
      model: "claude-sonnet-4-6",
      escalated: false,
      flagged: false,
      inputTokens: 1_000_000,
      outputTokens: 100_000,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
      status: "ok" as const,
      createdAt: WITHIN_TARGET_DAY,
    }));
    await db.insert(analysisLogs).values(rows);

    const app = createApp();
    const res = await getReport(app, `?date=${TARGET_DATE}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { totalCostUsd: number; alert: boolean; alertThresholdUsd: number };
    expect(body.totalCostUsd).toBeGreaterThan(20);
    expect(body.alert).toBe(true);
    expect(body.alertThresholdUsd).toBe(20);
  });
});
