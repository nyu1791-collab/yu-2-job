/**
 * POST /v1/webhooks/revenuecat 統合テスト(M5)。
 *
 * - Authorizationヘッダの共有シークレット検証(誤シークレット->401)
 * - INITIAL_PURCHASE -> subscriptionsにtrial/active行をupsert
 * - 同一event.idの再送 -> 重複なし(no-op)
 * - RENEWAL/CANCELLATION/EXPIRATION/BILLING_ISSUE/UNCANCELLATION/PRODUCT_CHANGEでのstatus遷移
 * - users.rc_app_user_idが見つからない場合 -> pending保存 + 200(404にしない)
 * - PUT /v1/me/rc-app-user-id -> 保留イベントの再適用
 */

import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { _resetDbForTest, _setDbForTest, type Db } from "../src/db/client.js";
import { pendingSubscriptionEvents, processedWebhookEvents, subscriptions, users } from "../src/db/schema.js";
import { signAccessToken } from "../src/lib/jwt.js";
import { setupTestDb } from "./helpers/db.js";

const ORIGINAL_ENV = { ...process.env };
const WEBHOOK_SECRET = "test-rc-webhook-secret";

function buildEvent(overrides: Record<string, unknown> = {}) {
  return {
    id: "evt_001",
    type: "INITIAL_PURCHASE",
    app_user_id: "rc-user-001",
    product_id: "pashacaro_monthly",
    entitlement_ids: ["premium"],
    period_type: "TRIAL",
    event_timestamp_ms: Date.now(),
    expiration_at_ms: Date.now() + 7 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

async function postWebhook(app: ReturnType<typeof createApp>, event: Record<string, unknown>, secret = WEBHOOK_SECRET) {
  return app.request("/v1/webhooks/revenuecat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ event }),
  });
}

describe("POST /v1/webhooks/revenuecat", () => {
  let db: Db;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, REVENUECAT_WEBHOOK_SECRET: WEBHOOK_SECRET, JWT_SECRET: "test-jwt-secret" };
    _setDbForTest(db);
  });

  afterEach(async () => {
    process.env = { ...ORIGINAL_ENV };
    _resetDbForTest();
    await db.delete(pendingSubscriptionEvents);
    await db.delete(processedWebhookEvents);
    await db.delete(subscriptions);
  });

  afterAll(async () => {
    const maybeClose = (db as unknown as { $client?: { close?: () => Promise<void> } }).$client;
    await maybeClose?.close?.();
  });

  it("誤った共有シークレットは401", async () => {
    const app = createApp();
    const res = await postWebhook(app, buildEvent(), "wrong-secret");
    expect(res.status).toBe(401);
  });

  it("Authorizationヘッダーが無い場合は401", async () => {
    const app = createApp();
    const res = await app.request("/v1/webhooks/revenuecat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event: buildEvent() }),
    });
    expect(res.status).toBe(401);
  });

  it("REVENUECAT_WEBHOOK_SECRET未設定時は500", async () => {
    delete process.env["REVENUECAT_WEBHOOK_SECRET"];
    const app = createApp();
    const res = await postWebhook(app, buildEvent());
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error_kind: string };
    expect(body.error_kind).toBe("config_error");
  });

  it("INITIAL_PURCHASE(TRIAL): users.rc_app_user_idが一致するユーザーのsubscriptionsをtrialでupsertする", async () => {
    const inserted = await db.insert(users).values({ email: "rc-user1@example.com", rcAppUserId: "rc-user-001" }).returning();
    const userId = inserted[0]!.id;

    const app = createApp();
    const res = await postWebhook(app, buildEvent({ id: "evt_initial_001" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("applied");

    const subRows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    expect(subRows).toHaveLength(1);
    expect(subRows[0]!.status).toBe("trial");
    expect(subRows[0]!.rcAppUserId).toBe("rc-user-001");
    expect(subRows[0]!.productId).toBe("pashacaro_monthly");
    expect(subRows[0]!.lastEventId).toBe("evt_initial_001");
  });

  it("同一event.idの再送はno-op(subscriptions行は重複しない)", async () => {
    const inserted = await db.insert(users).values({ email: "rc-user2@example.com", rcAppUserId: "rc-user-002" }).returning();
    const userId = inserted[0]!.id;

    const app = createApp();
    const event = buildEvent({ id: "evt_dup_001", app_user_id: "rc-user-002" });

    const res1 = await postWebhook(app, event);
    expect(res1.status).toBe(200);
    expect(((await res1.json()) as { status: string }).status).toBe("applied");

    const res2 = await postWebhook(app, event);
    expect(res2.status).toBe(200);
    expect(((await res2.json()) as { status: string }).status).toBe("duplicate");

    const subRows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    expect(subRows).toHaveLength(1);

    const processedRows = await db.select().from(processedWebhookEvents).where(eq(processedWebhookEvents.eventId, "evt_dup_001"));
    expect(processedRows).toHaveLength(1);
  });

  it("RENEWAL(NORMAL): statusがactiveになる", async () => {
    await db.insert(users).values({ email: "rc-user3@example.com", rcAppUserId: "rc-user-003" }).returning();

    const app = createApp();
    await postWebhook(app, buildEvent({ id: "evt_initial_003", app_user_id: "rc-user-003", period_type: "TRIAL" }));
    const res = await postWebhook(
      app,
      buildEvent({ id: "evt_renewal_003", app_user_id: "rc-user-003", type: "RENEWAL", period_type: "NORMAL" }),
    );
    expect(res.status).toBe(200);

    const inserted = await db.select().from(users).where(eq(users.rcAppUserId, "rc-user-003"));
    const subRows = await db.select().from(subscriptions).where(eq(subscriptions.userId, inserted[0]!.id));
    expect(subRows[0]!.status).toBe("active");
  });

  it("EXPIRATION: statusがexpiredになる", async () => {
    await db.insert(users).values({ email: "rc-user4@example.com", rcAppUserId: "rc-user-004" }).returning();

    const app = createApp();
    await postWebhook(app, buildEvent({ id: "evt_initial_004", app_user_id: "rc-user-004", period_type: "TRIAL" }));
    await postWebhook(
      app,
      buildEvent({
        id: "evt_expiration_004",
        app_user_id: "rc-user-004",
        type: "EXPIRATION",
        expiration_at_ms: Date.now() - 1000,
        event_timestamp_ms: Date.now() + 1000,
      }),
    );

    const inserted = await db.select().from(users).where(eq(users.rcAppUserId, "rc-user-004"));
    const subRows = await db.select().from(subscriptions).where(eq(subscriptions.userId, inserted[0]!.id));
    expect(subRows[0]!.status).toBe("expired");
  });

  it("BILLING_ISSUE: statusがbilling_issueになる", async () => {
    await db.insert(users).values({ email: "rc-user5@example.com", rcAppUserId: "rc-user-005" }).returning();

    const app = createApp();
    await postWebhook(app, buildEvent({ id: "evt_initial_005", app_user_id: "rc-user-005", period_type: "NORMAL" }));
    await postWebhook(
      app,
      buildEvent({
        id: "evt_billing_005",
        app_user_id: "rc-user-005",
        type: "BILLING_ISSUE",
        event_timestamp_ms: Date.now() + 1000,
      }),
    );

    const inserted = await db.select().from(users).where(eq(users.rcAppUserId, "rc-user-005"));
    const subRows = await db.select().from(subscriptions).where(eq(subscriptions.userId, inserted[0]!.id));
    expect(subRows[0]!.status).toBe("billing_issue");
  });

  it("CANCELLATION(期限内): activeを維持し、UNCANCELLATIONでも継続する", async () => {
    await db.insert(users).values({ email: "rc-user6@example.com", rcAppUserId: "rc-user-006" }).returning();

    const app = createApp();
    const farFuture = Date.now() + 30 * 24 * 60 * 60 * 1000;
    await postWebhook(
      app,
      buildEvent({ id: "evt_initial_006", app_user_id: "rc-user-006", period_type: "NORMAL", expiration_at_ms: farFuture }),
    );
    await postWebhook(
      app,
      buildEvent({
        id: "evt_cancel_006",
        app_user_id: "rc-user-006",
        type: "CANCELLATION",
        period_type: "NORMAL",
        expiration_at_ms: farFuture,
        event_timestamp_ms: Date.now() + 1000,
      }),
    );

    const inserted = await db.select().from(users).where(eq(users.rcAppUserId, "rc-user-006"));
    let subRows = await db.select().from(subscriptions).where(eq(subscriptions.userId, inserted[0]!.id));
    expect(subRows[0]!.status).toBe("active");

    await postWebhook(
      app,
      buildEvent({
        id: "evt_uncancel_006",
        app_user_id: "rc-user-006",
        type: "UNCANCELLATION",
        period_type: "NORMAL",
        expiration_at_ms: farFuture,
        event_timestamp_ms: Date.now() + 2000,
      }),
    );
    subRows = await db.select().from(subscriptions).where(eq(subscriptions.userId, inserted[0]!.id));
    expect(subRows[0]!.status).toBe("active");
  });

  it("PRODUCT_CHANGE: 新しいproduct_idに更新される", async () => {
    await db.insert(users).values({ email: "rc-user7@example.com", rcAppUserId: "rc-user-007" }).returning();

    const app = createApp();
    await postWebhook(app, buildEvent({ id: "evt_initial_007", app_user_id: "rc-user-007", product_id: "pashacaro_monthly", period_type: "TRIAL" }));
    await postWebhook(
      app,
      buildEvent({
        id: "evt_change_007",
        app_user_id: "rc-user-007",
        type: "PRODUCT_CHANGE",
        product_id: "pashacaro_yearly",
        period_type: "NORMAL",
        event_timestamp_ms: Date.now() + 1000,
      }),
    );

    const inserted = await db.select().from(users).where(eq(users.rcAppUserId, "rc-user-007"));
    const subRows = await db.select().from(subscriptions).where(eq(subscriptions.userId, inserted[0]!.id));
    expect(subRows[0]!.productId).toBe("pashacaro_yearly");
    expect(subRows[0]!.status).toBe("active");
  });

  it("該当ユーザーが見つからない場合はpending保存+200(404にしない)", async () => {
    const app = createApp();
    const res = await postWebhook(app, buildEvent({ id: "evt_unknown_001", app_user_id: "rc-unknown-001" }));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body.status).toBe("pending");

    const pendingRows = await db.select().from(pendingSubscriptionEvents).where(eq(pendingSubscriptionEvents.rcAppUserId, "rc-unknown-001"));
    expect(pendingRows).toHaveLength(1);

    const subRows = await db.select().from(subscriptions);
    expect(subRows).toHaveLength(0);
  });

  it("PUT /v1/me/rc-app-user-id: 保留イベントが再適用されsubscriptionsへ反映される", async () => {
    const app = createApp();

    // 1. 購入Webhookが先に届く(ユーザーはまだrc_app_user_idを持たない)
    await postWebhook(app, buildEvent({ id: "evt_pending_apply_001", app_user_id: "rc-pending-001", period_type: "TRIAL" }));

    const pendingBefore = await db.select().from(pendingSubscriptionEvents).where(eq(pendingSubscriptionEvents.rcAppUserId, "rc-pending-001"));
    expect(pendingBefore).toHaveLength(1);

    // 2. サインイン後、PUT /v1/me/rc-app-user-id でrc_app_user_idを保存
    const insertedUser = await db.insert(users).values({ email: "rc-pending-user@example.com" }).returning();
    const userId = insertedUser[0]!.id;
    const accessToken = await signAccessToken(userId);

    const putRes = await app.request("/v1/me/rc-app-user-id", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ rcAppUserId: "rc-pending-001" }),
    });
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as { rcAppUserId: string; appliedPendingEvents: number };
    expect(putBody.rcAppUserId).toBe("rc-pending-001");
    expect(putBody.appliedPendingEvents).toBe(1);

    // 3. 保留イベントが消費され、subscriptionsにtrialが反映される
    const pendingAfter = await db.select().from(pendingSubscriptionEvents).where(eq(pendingSubscriptionEvents.rcAppUserId, "rc-pending-001"));
    expect(pendingAfter).toHaveLength(0);

    const subRows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId));
    expect(subRows).toHaveLength(1);
    expect(subRows[0]!.status).toBe("trial");
    expect(subRows[0]!.rcAppUserId).toBe("rc-pending-001");
  });
});
