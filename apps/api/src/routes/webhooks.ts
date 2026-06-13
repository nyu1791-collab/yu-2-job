/**
 * RevenueCat Webhook(PLAN.md §4.5 M5)。
 *
 * POST /v1/webhooks/revenuecat
 *   - `Authorization` ヘッダの共有シークレット(`REVENUECAT_WEBHOOK_SECRET`)で検証する。
 *     RevenueCatのWebhook設定で "Authorization Header Value" にこのシークレットを設定する想定。
 *   - イベント本体は `{ event: {...} }` 形式(RevenueCatの実際のペイロード)。
 *   - `applyRevenueCatEvent`(lib/revenuecat.ts)でsubscriptionsへ反映する。
 *
 * 認証ヘッダーが無い/不一致の場合は401。
 * `REVENUECAT_WEBHOOK_SECRET` 未設定時は500(設定不備として明示する)。
 *
 * DB未設定(DATABASE_URLなし・非テスト環境)の場合は503。
 */

import { Hono } from "hono";
import { z } from "zod";
import { getDb, isDbConfigured } from "../db/client.js";
import { applyRevenueCatEvent, type RevenueCatEvent } from "../lib/revenuecat.js";

export const webhooksRoute = new Hono();

const RevenueCatEventSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().min(1),
    app_user_id: z.string().min(1),
  })
  .passthrough();

const RevenueCatWebhookBodySchema = z.object({
  event: RevenueCatEventSchema,
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

webhooksRoute.post("/v1/webhooks/revenuecat", async (c) => {
  const sharedSecret = process.env["REVENUECAT_WEBHOOK_SECRET"];
  if (!sharedSecret) {
    return c.json(
      {
        error_kind: "config_error",
        message: "REVENUECAT_WEBHOOK_SECRET が設定されていません。サーバ環境変数を確認してください。",
      },
      500,
    );
  }

  const authHeader = c.req.header("Authorization");
  // RevenueCatの "Authorization Header Value" 設定はそのまま完全一致するヘッダー値、
  // または "Bearer <secret>" 形式のいずれかを受け付ける。
  const presented = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : authHeader;
  if (!presented || presented !== sharedSecret) {
    return c.json({ error_kind: "unauthorized", message: "Authorizationヘッダーが不正です。" }, 401);
  }

  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }

  const body = await c.req.json().catch(() => null);
  const parseResult = RevenueCatWebhookBodySchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ error_kind: "invalid_request", message: "リクエストボディが不正です。" }, 400);
  }

  const event = parseResult.data.event as RevenueCatEvent;
  const db = await getDb();

  const result = await applyRevenueCatEvent(db, event);

  return c.json({ status: result.kind }, 200);
});
