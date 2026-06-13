/**
 * entitlementゲート・レート制限ゲート統合テスト(PLAN.md §4.5/§4.7 M5)。
 *
 * - GET /v1/me/entitlement: subscriptions行が無ければ status:"none"
 * - POST /v1/analyze: 未加入は403 subscription_required
 * - trialで期限内なら通過(devトークン以外でも)
 * - 期限切れなら403
 * - devトークンはentitlementゲートをバイパス
 * - レート制限: trial 5枚/日。6枚目は429 {error_kind:"rate_limited", remaining:0}
 */

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { _resetClientForTest } from "../src/lib/analyze.js";
import { _resetDbForTest, _setDbForTest, type Db } from "../src/db/client.js";
import { subscriptions, users } from "../src/db/schema.js";
import { recordAnalysisLog } from "../src/lib/analysis-logs.js";
import { signAccessToken } from "../src/lib/jwt.js";
import { DEV_USER_ID } from "../src/db/seed.js";
import { setupTestDb } from "./helpers/db.js";

const ORIGINAL_ENV = { ...process.env };

const ZERO_USAGE = {
  input_tokens: 0,
  output_tokens: 0,
  cache_read_input_tokens: 0,
  cache_creation_input_tokens: 0,
};

function imageBody() {
  return JSON.stringify({ imageBase64: "AAAA", mediaType: "image/jpeg" });
}

describe("entitlementゲート・レート制限ゲート", () => {
  let db: Db;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      DEV_TOKEN: "dev-secret",
      JWT_SECRET: "test-jwt-secret",
    };
    _setDbForTest(db);
    _resetClientForTest();
  });

  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    _resetDbForTest();
    _resetClientForTest();
    await db.delete(subscriptions);
  });

  afterAll(async () => {
    const maybeClose = (db as unknown as { $client?: { close?: () => Promise<void> } }).$client;
    await maybeClose?.close?.();
  });

  async function createUserWithToken(email: string): Promise<{ userId: string; accessToken: string }> {
    const inserted = await db.insert(users).values({ email }).returning();
    const userId = inserted[0]!.id;
    const accessToken = await signAccessToken(userId);
    return { userId, accessToken };
  }

  async function insertSubscription(input: {
    userId: string;
    status: "trial" | "active" | "billing_issue" | "expired";
    expiresAt: Date;
  }): Promise<void> {
    await db.insert(subscriptions).values({
      userId: input.userId,
      rcAppUserId: `rc-${input.userId}`,
      entitlement: "premium",
      status: input.status,
      productId: "pashacaro_monthly",
      expiresAt: input.expiresAt,
      lastEventAt: new Date(),
      lastEventId: `evt-${input.userId}`,
    });
  }

  describe("GET /v1/me/entitlement", () => {
    it("subscriptions行が無い場合はstatus:none, entitled:false", async () => {
      const { accessToken } = await createUserWithToken("no-sub@example.com");
      const app = createApp();
      const res = await app.request("/v1/me/entitlement", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { entitled: boolean; status: string };
      expect(body.entitled).toBe(false);
      expect(body.status).toBe("none");
    });

    it("trialで期限内ならentitled:true, status:trial", async () => {
      const { userId, accessToken } = await createUserWithToken("trial-sub@example.com");
      await insertSubscription({ userId, status: "trial", expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000) });

      const app = createApp();
      const res = await app.request("/v1/me/entitlement", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { entitled: boolean; status: string; expiresAt: string | null };
      expect(body.entitled).toBe(true);
      expect(body.status).toBe("trial");
      expect(body.expiresAt).not.toBeNull();
    });
  });

  describe("/v1/analyze entitlementゲート", () => {
    it("未加入(subscriptions行なし)は403 subscription_required", async () => {
      const { accessToken } = await createUserWithToken("unsubscribed@example.com");
      const app = createApp();
      const res = await app.request("/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: imageBody(),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error_kind: string };
      expect(body.error_kind).toBe("subscription_required");
    });

    it("期限切れ(expired)は403 subscription_required", async () => {
      const { userId, accessToken } = await createUserWithToken("expired-sub@example.com");
      await insertSubscription({ userId, status: "expired", expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000) });

      const app = createApp();
      const res = await app.request("/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: imageBody(),
      });
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error_kind: string };
      expect(body.error_kind).toBe("subscription_required");
    });

    it("expires_atが過去だがstatus=activeでも403(±5分猶予を超えた失効)", async () => {
      const { userId, accessToken } = await createUserWithToken("active-but-expired@example.com");
      await insertSubscription({ userId, status: "active", expiresAt: new Date(Date.now() - 60 * 60 * 1000) });

      const app = createApp();
      const res = await app.request("/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: imageBody(),
      });
      expect(res.status).toBe(403);
    });

    it("trialで期限内ならゲートを通過する(ANTHROPIC_API_KEY未設定のため500 config_errorで止まるが、403/429ではない)", async () => {
      const { userId, accessToken } = await createUserWithToken("trial-active@example.com");
      await insertSubscription({ userId, status: "trial", expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000) });
      delete process.env["ANTHROPIC_API_KEY"];

      const app = createApp();
      const res = await app.request("/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: imageBody(),
      });
      // entitlement/レート制限ゲートは通過 -> パイプライン側のconfig_error(500)に到達する
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error_kind: string };
      expect(body.error_kind).toBe("config_error");
    });

    it("devトークンはentitlementゲートをバイパスする", async () => {
      delete process.env["ANTHROPIC_API_KEY"];
      const app = createApp();
      const res = await app.request("/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer dev-secret" },
        body: imageBody(),
      });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error_kind: string };
      expect(body.error_kind).toBe("config_error");
    });
  });

  describe("/v1/analyze レート制限ゲート", () => {
    it("trialは5枚/日。5枚目まではゲート通過(429ではない)、6枚目は429 remaining:0", async () => {
      const { userId, accessToken } = await createUserWithToken("rate-limit-trial@example.com");
      await insertSubscription({ userId, status: "trial", expiresAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000) });
      delete process.env["ANTHROPIC_API_KEY"];

      const app = createApp();

      // 既に4枚解析済みとして analysis_logs に直接記録する
      for (let i = 0; i < 4; i++) {
        await recordAnalysisLog(db, {
          userId,
          model: "claude-haiku-4-5",
          escalated: false,
          flagged: false,
          usage: ZERO_USAGE,
          latencyMs: 100,
          status: "ok",
        });
      }

      // 5枚目: ゲートは通過し、APIキー未設定によりconfig_error(500)で止まる(429ではない)
      const res5 = await app.request("/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: imageBody(),
      });
      expect(res5.status).toBe(500);

      // 5枚目もanalysis_logsに記録されたことにする(本来はパイプライン成功時に記録される)
      await recordAnalysisLog(db, {
        userId,
        model: "claude-haiku-4-5",
        escalated: false,
        flagged: false,
        usage: ZERO_USAGE,
        latencyMs: 100,
        status: "ok",
      });

      // 6枚目: レート制限超過 -> 429
      const res6 = await app.request("/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: imageBody(),
      });
      expect(res6.status).toBe(429);
      const body6 = (await res6.json()) as { error_kind: string; remaining: number };
      expect(body6.error_kind).toBe("rate_limited");
      expect(body6.remaining).toBe(0);
    });

    it("activeは50枚/日(trial上限5枚を超えても403/429にならない)", async () => {
      const { userId, accessToken } = await createUserWithToken("rate-limit-active@example.com");
      await insertSubscription({ userId, status: "active", expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
      delete process.env["ANTHROPIC_API_KEY"];

      const app = createApp();

      for (let i = 0; i < 5; i++) {
        await recordAnalysisLog(db, {
          userId,
          model: "claude-haiku-4-5",
          escalated: false,
          flagged: false,
          usage: ZERO_USAGE,
          latencyMs: 100,
          status: "ok",
        });
      }

      const res = await app.request("/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: imageBody(),
      });
      // active(50枚/日)はまだ余裕があるため、レート制限ではなくconfig_error(500)に到達する
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error_kind: string };
      expect(body.error_kind).toBe("config_error");
    });

    it("devトークンはactive扱い(50枚/日)。5枚記録済みでも429にならない", async () => {
      delete process.env["ANTHROPIC_API_KEY"];
      const app = createApp();

      for (let i = 0; i < 5; i++) {
        await recordAnalysisLog(db, {
          userId: DEV_USER_ID,
          model: "claude-haiku-4-5",
          escalated: false,
          flagged: false,
          usage: ZERO_USAGE,
          latencyMs: 100,
          status: "ok",
        });
      }

      const res = await app.request("/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer dev-secret" },
        body: imageBody(),
      });
      expect(res.status).toBe(500);
      const body = (await res.json()) as { error_kind: string };
      expect(body.error_kind).toBe("config_error");

      // devユーザーのanalysis_logsをクリーンアップ(他テストへの影響防止)
      await db.delete((await import("../src/db/schema.js")).analysisLogs).where(
        eq((await import("../src/db/schema.js")).analysisLogs.userId, DEV_USER_ID),
      );
    });
  });
});
