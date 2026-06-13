/**
 * RevenueCat Webhook処理(PLAN.md §4.5/§4.7 M5)。
 *
 * POST /v1/webhooks/revenuecat は `Authorization` ヘッダに設定した共有シークレット
 * (`REVENUECAT_WEBHOOK_SECRET`)で検証し、本ファイルの `applyRevenueCatEvent` で
 * `subscriptions` テーブルへ反映する。
 *
 * ## 対応イベント
 * INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / PRODUCT_CHANGE -> status: "trial" | "active"
 *   - `period_type` が "TRIAL" の場合は status="trial"、それ以外は "active"
 * CANCELLATION -> 自動更新解除のみ。expires_atまでは引き続き有効なため、
 *   即時には status を変更しない(expires_at到来後にEXPIRATIONが届く想定)。
 *   ただし expires_at が未来でなければ "expired" とする。
 * EXPIRATION -> status: "expired"
 * BILLING_ISSUE -> status: "billing_issue"(課金トラブル。entitlementは猶予期間中)
 *
 * ## ユーザー紐付けとpending設計(設計判断)
 * RevenueCatの `app_user_id` は、サインイン前は匿名ID、サインイン後は
 * `Purchases.logIn(userId)` でサーバの users.id にエイリアス統合される
 * (apps/mobile側でサインイン後に `PUT /v1/me/rc-app-user-id` を呼び、
 * users.rc_app_user_id = app_user_id を保存する)。
 *
 * Webhookは購入イベントの非同期配信であり、配信タイミングは
 * 「サインイン -> rc_app_user_id保存」より早いことも遅いこともある。
 * そのため:
 *   - `users.rc_app_user_id = event.app_user_id` のユーザーが見つかれば、
 *     即座に subscriptions をupsertする。
 *   - 見つからない場合は 404 を返さず 200 を返し、
 *     `pending_subscription_events` に app_user_id をキーとして保存する
 *     (RevenueCatは非2xx応答を再送し続けるため、404にすると無限リトライや
 *      アラートの原因になる。一方、サーバ側はユーザー作成前のイベントを
 *      失いたくないため保留しておく)。
 *   - `PUT /v1/me/rc-app-user-id` でユーザーがrc_app_user_idを保存したタイミングで
 *     `applyPendingSubscriptionEvents` を呼び、保留イベントをタイムスタンプ昇順に
 *     再適用する。
 *
 * ## 冪等性
 * `event.id` を `processed_webhook_events`(unique制約)に記録し、
 * 既に処理済みのevent.idが再送された場合はno-op(200を返す)。
 */

import { eq, sql } from "drizzle-orm";
import { dbRows, type Db } from "../db/client.js";
import { pendingSubscriptionEvents, processedWebhookEvents, subscriptions, users } from "../db/schema.js";

/** RevenueCat Webhookが送る `event.type` のうちM5で扱うもの。 */
export const SUPPORTED_RC_EVENT_TYPES = [
  "INITIAL_PURCHASE",
  "RENEWAL",
  "CANCELLATION",
  "EXPIRATION",
  "BILLING_ISSUE",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
] as const;

export type SupportedRcEventType = (typeof SUPPORTED_RC_EVENT_TYPES)[number];

export function isSupportedRcEventType(type: string): type is SupportedRcEventType {
  return (SUPPORTED_RC_EVENT_TYPES as readonly string[]).includes(type);
}

/** RevenueCat Webhookのevent本体(必要なフィールドのみ抜粋)。 */
export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id: string;
  product_id?: string;
  entitlement_id?: string | null;
  entitlement_ids?: string[] | null;
  period_type?: string | null; // "TRIAL" | "NORMAL" | "INTRO" | "PROMOTIONAL"
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number;
  [key: string]: unknown;
}

export type ApplyResult =
  | { kind: "duplicate" }
  | { kind: "applied"; userId: string; status: SubscriptionStatus }
  | { kind: "pending"; rcAppUserId: string };

export type SubscriptionStatus = "trial" | "active" | "billing_issue" | "expired";

const DEFAULT_ENTITLEMENT = "premium";

/** event_timestamp_ms が無い場合は Date.now() を使う。 */
function eventTimestampMs(event: RevenueCatEvent): number {
  return event.event_timestamp_ms ?? Date.now();
}

/** イベントから entitlement 識別子を決める(entitlement_ids優先、無ければデフォルト)。 */
function resolveEntitlement(event: RevenueCatEvent): string {
  if (event.entitlement_ids && event.entitlement_ids.length > 0) {
    return event.entitlement_ids[0]!;
  }
  if (event.entitlement_id) {
    return event.entitlement_id;
  }
  return DEFAULT_ENTITLEMENT;
}

/** イベントタイプ・period_type・expires_atから新しい status を決定する。 */
function resolveStatus(event: RevenueCatEvent, expiresAt: Date, now: Date): SubscriptionStatus {
  switch (event.type as SupportedRcEventType) {
    case "EXPIRATION":
      return "expired";
    case "BILLING_ISSUE":
      return "billing_issue";
    case "CANCELLATION":
      // 自動更新解除のみ。expires_atが既に過去なら即時expired、
      // そうでなければ猶予期間(まだ有効)として現在のstatusを維持しない場合は
      // period_typeから判定(通常はNORMAL=active継続)。
      if (expiresAt.getTime() <= now.getTime()) {
        return "expired";
      }
      return event.period_type === "TRIAL" ? "trial" : "active";
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    default:
      return event.period_type === "TRIAL" ? "trial" : "active";
  }
}

/** expires_atを決定する。指定が無い場合は安全側として「既に期限切れ」(now)を返す。 */
function resolveExpiresAt(event: RevenueCatEvent, now: Date): Date {
  if (event.expiration_at_ms) {
    return new Date(event.expiration_at_ms);
  }
  return now;
}

/**
 * `processed_webhook_events` に event.id を記録する。既存(重複)の場合は false を返す。
 */
async function markEventProcessed(
  db: Db,
  event: RevenueCatEvent,
  userId: string | null,
): Promise<boolean> {
  try {
    await db.insert(processedWebhookEvents).values({
      eventId: event.id,
      eventType: event.type,
      rcAppUserId: event.app_user_id,
      userId,
    });
    return true;
  } catch (err) {
    if (isUniqueViolation(err)) {
      return false;
    }
    throw err;
  }
}

/** Postgres/PGliteのunique制約違反(SQLSTATE 23505)かどうかを判定する。 */
function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string; cause?: { code?: string } } | null)?.code
    ?? (err as { cause?: { code?: string } } | null)?.cause?.code;
  return code === "23505";
}

/** users.rc_app_user_id = rcAppUserId のユーザーIDを返す(無ければnull)。 */
async function findUserIdByRcAppUserId(db: Db, rcAppUserId: string): Promise<string | null> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.rcAppUserId, rcAppUserId))
    .limit(1);
  return rows[0]?.id ?? null;
}

/** subscriptions テーブルへ1件upsertする(userId.unique制約を利用)。 */
async function upsertSubscription(
  db: Db,
  input: {
    userId: string;
    rcAppUserId: string;
    entitlement: string;
    status: SubscriptionStatus;
    productId: string;
    expiresAt: Date;
    lastEventAt: Date;
    lastEventId: string;
    rawLastEvent: unknown;
  },
): Promise<void> {
  const rawJson = JSON.stringify(input.rawLastEvent);

  await db.execute(sql`
    INSERT INTO subscriptions (
      user_id, rc_app_user_id, entitlement, status, product_id,
      expires_at, last_event_at, last_event_id, raw_last_event
    )
    VALUES (
      ${input.userId}, ${input.rcAppUserId}, ${input.entitlement}, ${input.status}, ${input.productId},
      ${input.expiresAt.toISOString()}, ${input.lastEventAt.toISOString()}, ${input.lastEventId}, ${rawJson}::jsonb
    )
    ON CONFLICT (user_id) DO UPDATE SET
      rc_app_user_id = EXCLUDED.rc_app_user_id,
      entitlement = EXCLUDED.entitlement,
      status = EXCLUDED.status,
      product_id = EXCLUDED.product_id,
      expires_at = EXCLUDED.expires_at,
      last_event_at = EXCLUDED.last_event_at,
      last_event_id = EXCLUDED.last_event_id,
      raw_last_event = EXCLUDED.raw_last_event
    WHERE subscriptions.last_event_at <= EXCLUDED.last_event_at
  `);
}

/**
 * RevenueCat Webhookイベント1件を処理する。
 *
 * - 未対応のevent.typeは無視("ignored")。
 * - event.idが処理済みなら "duplicate"(no-op)。
 * - users.rc_app_user_id が一致するユーザーがいれば subscriptionsへupsertし "applied"。
 * - 一致するユーザーがいなければ pending_subscription_events へ保存し "pending"。
 */
export async function applyRevenueCatEvent(
  db: Db,
  event: RevenueCatEvent,
): Promise<ApplyResult | { kind: "ignored" }> {
  if (!isSupportedRcEventType(event.type)) {
    return { kind: "ignored" };
  }

  const now = new Date();
  const userId = await findUserIdByRcAppUserId(db, event.app_user_id);

  // 冪等性チェック: event.id を processed_webhook_events に記録(重複なら何もしない)。
  const isNewEvent = await markEventProcessed(db, event, userId);
  if (!isNewEvent) {
    return { kind: "duplicate" };
  }

  if (!userId) {
    await savePendingEvent(db, event);
    return { kind: "pending", rcAppUserId: event.app_user_id };
  }

  const expiresAt = resolveExpiresAt(event, now);
  const status = resolveStatus(event, expiresAt, now);
  const entitlement = resolveEntitlement(event);
  const lastEventAt = new Date(eventTimestampMs(event));

  await upsertSubscription(db, {
    userId,
    rcAppUserId: event.app_user_id,
    entitlement,
    status,
    productId: event.product_id ?? "unknown",
    expiresAt,
    lastEventAt,
    lastEventId: event.id,
    rawLastEvent: event,
  });

  return { kind: "applied", userId, status };
}

/** pending_subscription_events へ保存する(event_idで冪等)。 */
async function savePendingEvent(db: Db, event: RevenueCatEvent): Promise<void> {
  const payloadJson = JSON.stringify(event);
  await db.execute(sql`
    INSERT INTO pending_subscription_events (event_id, event_type, rc_app_user_id, payload, event_timestamp_ms)
    VALUES (${event.id}, ${event.type}, ${event.app_user_id}, ${payloadJson}::jsonb, ${eventTimestampMs(event)})
    ON CONFLICT (event_id) DO NOTHING
  `);
}

interface PendingEventRow {
  [key: string]: unknown;
  id: number;
  event_id: string;
  event_type: string;
  rc_app_user_id: string;
  payload: RevenueCatEvent;
  event_timestamp_ms: number;
}

/**
 * 指定された rc_app_user_id の保留イベントを古い順(event_timestamp_ms昇順)に
 * 再適用し、適用済みの行を削除する。
 *
 * `PUT /v1/me/rc-app-user-id`(users.rc_app_user_id 設定時)から呼ぶ。
 * 戻り値: 適用したイベント数。
 */
export async function applyPendingSubscriptionEvents(
  db: Db,
  userId: string,
  rcAppUserId: string,
): Promise<number> {
  const pendingResult = await db.execute<PendingEventRow>(sql`
    SELECT id, event_id, event_type, rc_app_user_id, payload, event_timestamp_ms
    FROM pending_subscription_events
    WHERE rc_app_user_id = ${rcAppUserId}
    ORDER BY event_timestamp_ms ASC
  `);
  const pendingRows = dbRows<PendingEventRow>(pendingResult);

  let applied = 0;
  for (const row of pendingRows) {
    const event = row.payload;
    const expiresAt = resolveExpiresAt(event, new Date());
    const status = resolveStatus(event, expiresAt, new Date());
    const entitlement = resolveEntitlement(event);
    const lastEventAt = new Date(row.event_timestamp_ms);

    await upsertSubscription(db, {
      userId,
      rcAppUserId,
      entitlement,
      status,
      productId: event.product_id ?? "unknown",
      expiresAt,
      lastEventAt,
      lastEventId: event.id,
      rawLastEvent: event,
    });

    // processed_webhook_eventsのuser_idも紐付け直す(分析用)。
    await db
      .update(processedWebhookEvents)
      .set({ userId })
      .where(eq(processedWebhookEvents.eventId, row.event_id));

    await db.execute(sql`DELETE FROM pending_subscription_events WHERE id = ${row.id}`);
    applied += 1;
  }

  return applied;
}

export { subscriptions };
