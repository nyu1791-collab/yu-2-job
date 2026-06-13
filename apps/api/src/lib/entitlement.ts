/**
 * entitlement(課金状態)ゲート + レート制限ゲート(PLAN.md §4.5/§4.7 M5)。
 *
 * - requireEntitlement(): subscriptions.status in ('trial','active') かつ
 *   expires_at が未到来(±5分猶予)であることを要求するミドルウェア。
 *   devトークン認証時はバイパスする(検証用)。
 *   未加入 -> 403 {error_kind: "subscription_required"}
 *
 * - requireRateLimit(): analysis_logs の当日カウント(countTodayAnalyses)を使い、
 *   trial=5枚/日、active=50枚/日。devトークンはactive扱い(50枚)。
 *   超過 -> 429 {error_kind: "rate_limited", remaining: 0}
 *   通過時は `c.set("rateLimitRemaining", remaining)` でハンドラに残数を渡す。
 */

import type { Context, Next } from "hono";
import { eq } from "drizzle-orm";
import { getDb, isDbConfigured } from "../db/client.js";
import { subscriptions } from "../db/schema.js";
import { countTodayAnalyses } from "./analysis-logs.js";
import { getUserId } from "./auth.js";

/** trial/active時の日次解析上限枚数(PLAN.md §4.5/§4.7)。 */
export const DAILY_LIMIT_TRIAL = 5;
export const DAILY_LIMIT_ACTIVE = 50;

/** subscriptions.expires_at の許容猶予(Webhook配信遅延対策)。 */
const EXPIRY_GRACE_MS = 5 * 60 * 1000;

export type EffectivePlan = "trial" | "active";

export interface EntitlementInfo {
  entitled: boolean;
  status: "trial" | "active" | "billing_issue" | "expired" | "none";
  expiresAt: string | null;
  productId: string | null;
  entitlement: string | null;
  /** レート制限判定に使う実効プラン("trial" | "active")。未加入時はnull。 */
  plan: EffectivePlan | null;
}

/** リクエストが固定devトークンで認証されたものかどうかを判定する。 */
export function isDevTokenRequest(c: Context): boolean {
  const devToken = process.env["DEV_TOKEN"];
  if (!devToken) {
    return false;
  }
  const header = c.req.header("Authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return false;
  }
  return header.slice("Bearer ".length) === devToken;
}

/**
 * 指定ユーザーの現在のentitlement状況を返す。
 * subscriptions行が無い場合は status: "none", entitled: false。
 */
export async function getEntitlementInfo(userId: string, now: Date = new Date()): Promise<EntitlementInfo> {
  if (!isDbConfigured()) {
    return { entitled: false, status: "none", expiresAt: null, productId: null, entitlement: null, plan: null };
  }

  const db = await getDb();
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) {
    return { entitled: false, status: "none", expiresAt: null, productId: null, entitlement: null, plan: null };
  }

  const status = row.status as EntitlementInfo["status"];
  const expiresAtMs = new Date(row.expiresAt).getTime();
  const notExpired = expiresAtMs + EXPIRY_GRACE_MS >= now.getTime();
  const entitled = (status === "trial" || status === "active") && notExpired;

  return {
    entitled,
    status,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : String(row.expiresAt),
    productId: row.productId,
    entitlement: row.entitlement,
    plan: entitled ? (status === "trial" ? "trial" : "active") : null,
  };
}

/**
 * entitlementゲート(PLAN.md §4.5 M5)。
 *
 * - devトークン認証時はバイパスする。
 * - subscriptions.status in ('trial','active') かつ expires_at未到来(±5分猶予)を要求。
 * - 未加入 -> 403 {error_kind: "subscription_required"}
 *
 * `requireAuth()` の後に適用すること(getUserId(c)に依存)。
 */
export function requireEntitlement() {
  return async (c: Context, next: Next) => {
    if (isDevTokenRequest(c)) {
      await next();
      return;
    }

    if (!isDbConfigured()) {
      // DB未設定時はM1相当のフォールバック(entitlementチェックをスキップ)。
      await next();
      return;
    }

    const userId = getUserId(c);
    const info = await getEntitlementInfo(userId);

    if (!info.entitled) {
      return c.json(
        {
          error_kind: "subscription_required",
          message: "プレミアムプランへの加入が必要です。",
        },
        403,
      );
    }

    await next();
  };
}

/**
 * レート制限ゲート(PLAN.md §4.5/§4.7 M5)。
 *
 * - devトークン: active扱い(50枚/日)。
 * - trial: 5枚/日、active: 50枚/日。
 * - 超過 -> 429 {error_kind: "rate_limited", remaining: 0}
 * - 通過時: `c.set("rateLimitRemaining", remaining)`(残数。成功レスポンスに含める)。
 *
 * `requireAuth()` -> `requireEntitlement()` の後に適用すること。
 */
export function requireRateLimit() {
  return async (c: Context, next: Next) => {
    if (!isDbConfigured()) {
      // DB未設定時はM1相当のフォールバック(カウント不可のためスキップ)。
      await next();
      return;
    }

    const userId = getUserId(c);

    let limit: number;
    if (isDevTokenRequest(c)) {
      limit = DAILY_LIMIT_ACTIVE;
    } else {
      const info = await getEntitlementInfo(userId);
      limit = info.plan === "trial" ? DAILY_LIMIT_TRIAL : DAILY_LIMIT_ACTIVE;
    }

    const db = await getDb();
    const usedCount = await countTodayAnalyses(db, userId);

    if (usedCount >= limit) {
      return c.json(
        {
          error_kind: "rate_limited",
          message: "本日の解析上限に達しました。",
          remaining: 0,
        },
        429,
      );
    }

    c.set("rateLimitRemaining", limit - usedCount - 1);
    await next();
  };
}

/** ハンドラ内でレート制限の残数を取得する(requireRateLimit()適用後に有効)。 */
export function getRateLimitRemaining(c: Context): number | null {
  const value = c.get("rateLimitRemaining");
  return typeof value === "number" ? value : null;
}
