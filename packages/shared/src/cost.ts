/**
 * analysis_logs の使用量から1回の解析コスト(USD)を計算する純関数(M6 / PLAN.md §4.7)。
 *
 * 料金は Anthropic 公式の Claude Haiku 4.5 / Claude Sonnet 4.6 の
 * 1Mトークンあたりの価格(2026年時点の公開レート)を使用する:
 *
 *   - Claude Haiku 4.5  (claude-haiku-4-5):  入力 $1.00 / 1M tok, 出力 $5.00 / 1M tok
 *   - Claude Sonnet 4.6 (claude-sonnet-4-6): 入力 $3.00 / 1M tok, 出力 $15.00 / 1M tok
 *
 * キャッシュ:
 *   - cache_read_input_tokens  ≈ 通常入力価格 × 0.1 (キャッシュヒット)
 *   - cache_creation_input_tokens ≈ 通常入力価格 × 1.25 (デフォルト5分TTLでのキャッシュ書き込み)
 *
 * 注: PLAN.md §4.7 の「1解析コスト目安(Haiku・キャッシュヒット)≒ $0.005/枚」は
 * 当時の概算(読取/画像/出力をまとめた order-of-magnitude 推定)であり、
 * 本関数が使う上記の公式トークン単価とは単位・前提が異なる場合がある。
 * 本関数は analysis_logs に実記録される input_tokens / output_tokens /
 * cache_read_input_tokens / cache_creation_input_tokens から、上記の
 * 公式単価をそのまま適用して算出する(より正確で検証可能な値)。
 */

export const HAIKU_MODEL_ID = "claude-haiku-4-5";
export const SONNET_MODEL_ID = "claude-sonnet-4-6";

/** 1Mトークンあたりの単価(USD)。 */
interface ModelRates {
  /** 通常の入力トークン単価 ($/1Mtok) */
  inputPerMillion: number;
  /** 出力トークン単価 ($/1Mtok) */
  outputPerMillion: number;
  /** キャッシュ読み取り単価 ($/1Mtok)。通常入力の約0.1倍 */
  cacheReadPerMillion: number;
  /** キャッシュ書き込み単価 ($/1Mtok、5分TTL想定)。通常入力の約1.25倍 */
  cacheWritePerMillion: number;
}

const MODEL_RATES: Record<string, ModelRates> = {
  [HAIKU_MODEL_ID]: {
    inputPerMillion: 1.0,
    outputPerMillion: 5.0,
    cacheReadPerMillion: 1.0 * 0.1,
    cacheWritePerMillion: 1.0 * 1.25,
  },
  [SONNET_MODEL_ID]: {
    inputPerMillion: 3.0,
    outputPerMillion: 15.0,
    cacheReadPerMillion: 3.0 * 0.1,
    cacheWritePerMillion: 3.0 * 1.25,
  },
};

export interface AnalysisUsage {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

/**
 * analysis_logsの1行分のusageからUSDコストを計算する。
 *
 * 未知のmodel文字列が渡された場合は、最も保守的な(高い)レート —
 * Sonnetのレート — を使用してフォールバックする
 * (コスト監視は過小評価より過大評価の方が安全側のため)。
 */
export function computeAnalysisCostUsd(usage: AnalysisUsage): number {
  const rates = MODEL_RATES[usage.model] ?? MODEL_RATES[SONNET_MODEL_ID]!;

  const inputTokens = usage.input_tokens ?? 0;
  const outputTokens = usage.output_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
  const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;

  const inputCost = (inputTokens / 1_000_000) * rates.inputPerMillion;
  const outputCost = (outputTokens / 1_000_000) * rates.outputPerMillion;
  const cacheReadCost = (cacheReadTokens / 1_000_000) * rates.cacheReadPerMillion;
  const cacheWriteCost = (cacheCreationTokens / 1_000_000) * rates.cacheWritePerMillion;

  return inputCost + outputCost + cacheReadCost + cacheWriteCost;
}
