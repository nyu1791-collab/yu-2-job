/**
 * analysis_logs への記録 + 当日カウント(レート制限の下地)。PLAN.md §4.3。
 *
 * - 解析リクエストごとに model / escalated / flagged / トークン数 / latency_ms /
 *   status / raw_response を記録する。
 * - レート制限は専用テーブルなし。analysis_logs の当日カウント
 *   (Asia/Tokyo基準、status != 'error')で判定する(ゲート組込はM5)。
 */

import { and, eq, gte, lt, ne, sql } from "drizzle-orm";
import type { AnalyzePipelineResult } from "./analyze.js";
import { analysisLogs } from "../db/schema.js";
import { dbRows, type Db } from "../db/client.js";

/** JSONB列に渡す前に undefined を取り除く(JSON.stringifyで安全に扱える形にする)。 */
function toJsonbParam(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return JSON.stringify(value);
}

export type AnalysisLogStatus = "ok" | "parse_failed" | "not_food" | "error";

export interface RecordAnalysisLogInput {
  userId: string;
  model: string;
  escalated: boolean;
  flagged: boolean;
  usage: AnalyzePipelineResult["usage"];
  latencyMs: number;
  status: AnalysisLogStatus;
  rawResponse?: unknown;
}

/**
 * analysis_logs に1行記録し、挿入したIDを返す。
 *
 * 注意: db.insert(table).returning(...) はPgliteDatabase / PostgresJsDatabase の
 * union型(Db)に対して呼び出すと型解決でエラーになるため、sql テンプレート + RETURNING を使う。
 */
export async function recordAnalysisLog(db: Db, input: RecordAnalysisLogInput): Promise<number> {
  const rawResponseJson = toJsonbParam(input.rawResponse);

  const inserted = await db.execute<{ id: number }>(sql`
    INSERT INTO analysis_logs (
      user_id, model, escalated, flagged,
      input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens,
      latency_ms, status, raw_response
    )
    VALUES (
      ${input.userId}, ${input.model}, ${input.escalated}, ${input.flagged},
      ${input.usage.input_tokens}, ${input.usage.output_tokens},
      ${input.usage.cache_read_input_tokens}, ${input.usage.cache_creation_input_tokens},
      ${input.latencyMs}, ${input.status}, ${rawResponseJson}::jsonb
    )
    RETURNING id
  `);

  const id = dbRows<{ id: number }>(inserted)[0]?.id;
  if (id === undefined) {
    throw new Error("recordAnalysisLog: insert結果からidを取得できませんでした。");
  }
  return Number(id);
}

/** Asia/Tokyo の "YYYY-MM-DD" の開始・終了(翌日0時、排他的上限)をUTC Dateで返す。 */
export function tokyoDayRangeUtc(now: Date = new Date()): { start: Date; end: Date } {
  // Asia/Tokyo は UTC+9 固定(夏時間なし)。
  const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
  const tokyoNow = new Date(now.getTime() + TOKYO_OFFSET_MS);
  const y = tokyoNow.getUTCFullYear();
  const m = tokyoNow.getUTCMonth();
  const d = tokyoNow.getUTCDate();

  // Asia/Tokyo の当日0:00 を UTC に変換すると、UTC上では前日の15:00。
  const startUtc = new Date(Date.UTC(y, m, d, 0, 0, 0) - TOKYO_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { start: startUtc, end: endUtc };
}

/**
 * 当日(Asia/Tokyo基準)の analysis_logs 件数(status != 'error')を返す。
 * レート制限ゲート(M5)はこの値を使って trial 5枚/日・有料50枚/日を判定する。
 */
export async function countTodayAnalyses(db: Db, userId: string, now: Date = new Date()): Promise<number> {
  const { start, end } = tokyoDayRangeUtc(now);

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(analysisLogs)
    .where(
      and(
        eq(analysisLogs.userId, userId),
        ne(analysisLogs.status, "error"),
        gte(analysisLogs.createdAt, start),
        lt(analysisLogs.createdAt, end),
      ),
    );

  const count = dbRows<{ count: number | string }>(result)[0]?.count ?? 0;
  return Number(count);
}
