/**
 * 内部向けAPI(PLAN.md §4.6 / §4.7 M6)。
 *
 * GET /v1/internal/cost-report?date=YYYY-MM-DD
 *   - 指定日(Asia/Tokyo、省略時は本日)の analysis_logs を集計し、
 *     総コスト・ユーザー別上位・エスカレーション率・status別件数を返す。
 *   - 総コストが $20 を超える場合 `alert: true` を含める
 *     (フラグのみ。実際の通知(Slack等)は将来拡張 — TODOコメント参照)。
 *
 * 認証: `webhooks.ts` と同様の共有シークレット方式。
 *   `Authorization: Bearer <INTERNAL_CRON_SECRET>` を要求する。
 *   - シークレット未設定時は500 `{error_kind: "config_error"}`
 *   - 認証ヘッダー不一致/欠落時は401 `{error_kind: "unauthorized"}`
 *
 * DB未設定(DATABASE_URLなし・非テスト環境)の場合は503。
 *
 * Vercel Cron(vercel.json)が毎日 03:00 Asia/Tokyo(= 18:00 UTC 前日)に
 * このエンドポイントを呼び出す想定。
 *
 * 注意: Vercel CronはデフォルトでHTTPリクエストに `Authorization: Bearer <CRON_SECRET>`
 * (Vercelの環境変数 `CRON_SECRET`)を付与する。このルートは独自の
 * `INTERNAL_CRON_SECRET` を検証するため、デプロイ時は両方の環境変数に
 * 同じシークレット値を設定すること(`CRON_SECRET` と `INTERNAL_CRON_SECRET`)。
 */

import { Hono } from "hono";
import { and, gte, lt } from "drizzle-orm";
import { z } from "zod";
import { computeAnalysisCostUsd, todayInTokyo } from "@pashacaro/shared";
import { getDb, isDbConfigured } from "../db/client.js";
import { analysisLogs } from "../db/schema.js";
import { tokyoDateRangeUtc } from "../lib/analysis-logs.js";

export const internalRoute = new Hono();

const DATE_QUERY_SCHEMA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** 日次コストアラートの閾値(USD)。PLAN.md §4.7: 日次$20超でアラート。 */
export const DAILY_COST_ALERT_THRESHOLD_USD = 20;

/** 1ユーザーあたりのコスト上位を何件返すか。 */
const TOP_USERS_LIMIT = 10;

function dbUnavailableResponse(c: import("hono").Context) {
  return c.json(
    {
      error_kind: "db_unavailable",
      message: "DBが設定されていません。DATABASE_URLを設定してください。",
    },
    503,
  );
}

internalRoute.get("/v1/internal/cost-report", async (c) => {
  const sharedSecret = process.env["INTERNAL_CRON_SECRET"];
  if (!sharedSecret) {
    return c.json(
      {
        error_kind: "config_error",
        message: "INTERNAL_CRON_SECRET が設定されていません。サーバ環境変数を確認してください。",
      },
      500,
    );
  }

  const authHeader = c.req.header("Authorization");
  const presented = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : authHeader;
  if (!presented || presented !== sharedSecret) {
    return c.json({ error_kind: "unauthorized", message: "Authorizationヘッダーが不正です。" }, 401);
  }

  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }

  const dateParam = c.req.query("date");
  let targetDate: string;
  if (dateParam !== undefined) {
    const parseResult = DATE_QUERY_SCHEMA.safeParse(dateParam);
    if (!parseResult.success) {
      return c.json(
        { error_kind: "invalid_request", message: "dateクエリパラメータをYYYY-MM-DD形式で指定してください。" },
        400,
      );
    }
    targetDate = parseResult.data;
  } else {
    targetDate = todayInTokyo();
  }

  const db = await getDb();
  const { start, end } = tokyoDateRangeUtc(targetDate);

  const rows = await db
    .select()
    .from(analysisLogs)
    .where(and(gte(analysisLogs.createdAt, start), lt(analysisLogs.createdAt, end)));

  let totalCostUsd = 0;
  let escalatedCount = 0;
  const statusCounts: Record<string, number> = {};
  const perUserCost = new Map<string, number>();
  const perUserCount = new Map<string, number>();

  for (const row of rows) {
    const costUsd = computeAnalysisCostUsd({
      model: row.model,
      input_tokens: row.inputTokens,
      output_tokens: row.outputTokens,
      cache_read_input_tokens: row.cacheReadInputTokens,
      cache_creation_input_tokens: row.cacheCreationInputTokens,
    });
    totalCostUsd += costUsd;

    if (row.escalated) {
      escalatedCount += 1;
    }

    statusCounts[row.status] = (statusCounts[row.status] ?? 0) + 1;

    perUserCost.set(row.userId, (perUserCost.get(row.userId) ?? 0) + costUsd);
    perUserCount.set(row.userId, (perUserCount.get(row.userId) ?? 0) + 1);
  }

  const totalCount = rows.length;
  const escalationRate = totalCount > 0 ? escalatedCount / totalCount : 0;
  const parseFailedRate = totalCount > 0 ? (statusCounts["parse_failed"] ?? 0) / totalCount : 0;

  const topUsers = [...perUserCost.entries()]
    .map(([userId, costUsd]) => ({
      userId,
      costUsd,
      count: perUserCount.get(userId) ?? 0,
    }))
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, TOP_USERS_LIMIT);

  const alert = totalCostUsd > DAILY_COST_ALERT_THRESHOLD_USD;

  // TODO(Phase2): alert===true の場合にSlack等へ通知する(現時点ではフラグのみ)。

  return c.json(
    {
      date: targetDate,
      totalCount,
      totalCostUsd,
      escalatedCount,
      escalationRate,
      statusCounts,
      parseFailedRate,
      topUsers,
      alert,
      alertThresholdUsd: DAILY_COST_ALERT_THRESHOLD_USD,
    },
    200,
  );
});
