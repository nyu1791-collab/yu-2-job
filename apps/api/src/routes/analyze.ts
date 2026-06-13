import { Hono } from "hono";
import {
  AnalysisSchema,
  matchAnalysis,
  type Analysis,
  type CorrectedAnalysis,
} from "@pashacaro/shared";
import { z } from "zod";
import {
  ImageTooLargeError,
  MAX_IMAGE_BASE64_BYTES,
  MissingApiKeyError,
  runAnalysisPipeline,
  type AnalyzePipelineResult,
} from "../lib/analyze.js";
import { getUserId, requireAuth } from "../lib/auth.js";
import { getDb, isDbConfigured } from "../db/client.js";
import { recordAnalysisLog } from "../lib/analysis-logs.js";
import { buildMatchesForDishes } from "../lib/food-lookup.js";

export const analyzeRoute = new Hono();

const ImageAnalyzeRequestSchema = z.object({
  imageBase64: z.string().min(1),
  mediaType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  takenAt: z.string().nullable().optional(),
  userNote: z.string().nullable().optional(),
});

const TextAnalyzeRequestSchema = z.object({
  text: z.string().min(1),
  takenAt: z.string().nullable().optional(),
});

interface AnalyzeSuccessResponse {
  analysis: CorrectedAnalysis | Analysis;
  escalated: boolean;
  flagged: boolean;
  model: string;
  usage: AnalyzePipelineResult["usage"];
  matched_product_id: null;
  analysisLogId: number | null;
}

/** PLAN.md §4.2 失敗時UXの応答ヘルパー */
function buildContext(input: {
  takenAt?: string | null;
  userNote?: string | null;
  text?: string;
}): string {
  const parts: string[] = [];
  if (input.text) {
    parts.push(`ユーザーが入力した食事内容のテキスト: 「${input.text}」`);
  }
  parts.push(`撮影時刻: ${input.takenAt ?? "不明"}`);
  parts.push(`ユーザー補足: ${input.userNote ?? "なし"}`);
  return parts.join("。");
}

/**
 * POST /v1/analyze
 * {imageBase64, mediaType, takenAt?, userNote?} -> Analysis + 補正済み栄養 + analysisLogId(M2)
 *
 * ミドルウェア順(M1版): devトークン検証 -> 画像サイズ検証(2MB超は413) -> 解析
 * entitlement/レート制限はM5で追加。
 */
analyzeRoute.post("/v1/analyze", requireAuth(), async (c) => {
  const userId = getUserId(c);

  const body = await c.req.json().catch(() => null);
  const parseResult = ImageAnalyzeRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      { error_kind: "invalid_request", message: "リクエストボディが不正です。" },
      400,
    );
  }
  const { imageBase64, mediaType, takenAt, userNote } = parseResult.data;

  // 画像サイズ検証(base64 2MB超は413)
  const byteLength = Buffer.byteLength(imageBase64, "utf-8");
  if (byteLength > MAX_IMAGE_BASE64_BYTES) {
    return c.json(
      { error_kind: "image_too_large", message: "画像データが大きすぎます(2MB以下にしてください)。" },
      413,
    );
  }

  const context = buildContext({ takenAt, userNote });

  const startedAt = Date.now();
  try {
    const result = await runAnalysisPipeline({
      mediaType,
      imageBase64,
      context,
    });

    return await handlePipelineResult(c, result, Date.now() - startedAt, userId);
  } catch (err) {
    return await handlePipelineError(c, err, Date.now() - startedAt, userId);
  }
});

/**
 * POST /v1/analyze/text
 * {text, takenAt?} -> Analysis (Haiku固定。systemは同一でキャッシュ共有)
 */
analyzeRoute.post("/v1/analyze/text", requireAuth(), async (c) => {
  const userId = getUserId(c);

  const body = await c.req.json().catch(() => null);
  const parseResult = TextAnalyzeRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json(
      { error_kind: "invalid_request", message: "リクエストボディが不正です。" },
      400,
    );
  }
  const { text, takenAt } = parseResult.data;
  const context = buildContext({ text, takenAt });

  const startedAt = Date.now();
  try {
    const result = await runAnalysisPipeline({
      mediaType: "image/jpeg", // 画像なし。フィールドはCallModelOptionsの型整合のためダミー値
      context,
    });

    return await handlePipelineResult(c, result, Date.now() - startedAt, userId);
  } catch (err) {
    return await handlePipelineError(c, err, Date.now() - startedAt, userId);
  }
});

/**
 * 解析結果(成功)を処理する。
 *
 * DB設定済み(isDbConfigured())の場合:
 *   1. food-lookupでdishごとの食材を成分表突合(food-lookup.ts + nutrition-match)
 *   2. corrected/カバレッジ/乖離減点を反映し、totalをdish合算で再計算
 *   3. analysis_logsに記録(status: ok | not_food)し analysisLogId をレスポンスに含める
 *
 * DB未設定(DATABASE_URLなし・非テスト)の場合:
 *   補正・ログ記録をスキップし、M1と同じ動作にフォールバックする
 *   (analysisLogId は null)。
 */
async function handlePipelineResult(
  c: import("hono").Context,
  result: AnalyzePipelineResult,
  latencyMs: number,
  userId: string,
) {
  // パース失敗(両モデル) -> 422
  if (result.parsed === null) {
    if (isDbConfigured()) {
      const db = await getDb();
      await recordAnalysisLog(db, {
        userId,
        model: result.finalModel,
        escalated: result.escalated,
        flagged: result.flagged,
        usage: result.usage,
        latencyMs,
        status: "parse_failed",
      });
    }
    return c.json(
      {
        error_kind: "parse_failed",
        message: "うまく解析できませんでした。再試行するか手動で入力してください。",
      },
      422,
    );
  }

  // is_food: false -> 200 + {error_kind: "not_food"}
  if (!result.parsed.is_food) {
    let analysisLogId: number | null = null;
    if (isDbConfigured()) {
      const db = await getDb();
      analysisLogId = await recordAnalysisLog(db, {
        userId,
        model: result.finalModel,
        escalated: result.escalated,
        flagged: result.flagged,
        usage: result.usage,
        latencyMs,
        status: "not_food",
        rawResponse: result.parsed,
      });
    }
    return c.json(
      {
        error_kind: "not_food",
        message: "食事が写っていないようです。",
        analysis: result.parsed,
        analysisLogId,
      },
      200,
    );
  }

  // 検証: AnalysisSchemaに準拠していること(messages.parseで既に保証されるが二重チェック)
  const validated = AnalysisSchema.parse(result.parsed);

  let analysis: CorrectedAnalysis | Analysis = validated;
  let analysisLogId: number | null = null;

  if (isDbConfigured()) {
    const db = await getDb();

    // 成分表突合(food-lookup + nutrition-match)。
    // 乖離減点(confidence-0.15 + notes追記)は matchAnalysis 内で処理済み。
    const matchesPerDish = await buildMatchesForDishes(db, validated.dishes);
    const matchResult = matchAnalysis(validated, matchesPerDish);
    analysis = matchResult.analysis;

    analysisLogId = await recordAnalysisLog(db, {
      userId,
      model: result.finalModel,
      escalated: result.escalated,
      flagged: result.flagged,
      usage: result.usage,
      latencyMs,
      status: "ok",
      rawResponse: validated,
    });
  }

  const response: AnalyzeSuccessResponse = {
    analysis,
    escalated: result.escalated,
    flagged: result.flagged,
    model: result.finalModel,
    usage: result.usage,
    matched_product_id: null, // Phase2布石
    analysisLogId,
  };

  return c.json(response, 200);
}

async function handlePipelineError(
  c: import("hono").Context,
  err: unknown,
  latencyMs: number,
  userId: string,
) {
  if (err instanceof MissingApiKeyError) {
    return c.json({ error_kind: "config_error", message: err.message }, 500);
  }
  if (err instanceof ImageTooLargeError) {
    return c.json({ error_kind: "image_too_large", message: err.message }, 413);
  }

  // Anthropic SDK の overloaded(529)・タイムアウト等は503として扱う(自動1回リトライはクライアント側)
  const anthropicError = err as { status?: number; name?: string } | null;
  if (
    anthropicError &&
    (anthropicError.status === 529 ||
      anthropicError.status === 504 ||
      anthropicError.name === "APIConnectionTimeoutError")
  ) {
    if (isDbConfigured()) {
      await recordErrorLog(userId, latencyMs, anthropicError);
    }
    return c.json(
      { error_kind: "upstream_unavailable", message: "解析サーバが混み合っています。もう一度お試しください。" },
      503,
    );
  }

  // レート制限超過(M5で実装予定。現状は到達しない)
  if (anthropicError && anthropicError.status === 429) {
    if (isDbConfigured()) {
      await recordErrorLog(userId, latencyMs, anthropicError);
    }
    return c.json(
      { error_kind: "rate_limited", message: "本日の解析上限に達しました。" },
      429,
    );
  }

  console.error("analyze pipeline error:", err);
  if (isDbConfigured()) {
    await recordErrorLog(userId, latencyMs, err);
  }
  return c.json(
    { error_kind: "error", message: "解析中にエラーが発生しました。" },
    500,
  );
}

/** status="error" として analysis_logs に記録する(モデル不明のため model は "unknown")。 */
async function recordErrorLog(userId: string, latencyMs: number, err: unknown): Promise<void> {
  const db = await getDb();
  await recordAnalysisLog(db, {
    userId,
    model: "unknown",
    escalated: false,
    flagged: false,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    latencyMs,
    status: "error",
    rawResponse: { error: String(err) },
  });
}
