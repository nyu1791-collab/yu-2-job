import type { Analysis } from "./analysis-schema.js";

/**
 * Haiku → Sonnet エスカレーション判定(PLAN.md §4.2)。
 *
 * 以下のいずれかに当てはまる場合、同一プロンプト・同一画像で
 * claude-sonnet-4-6 へ再解析する:
 *   1. parsed_output === null (Haikuで1回リトライ済み・再失敗)
 *   2. min(confidence) < 0.45 または グラム重み付き平均confidence < 0.6
 *   3. dishes.length >= 4 かつ 平均confidence < 0.7
 *   4. 整合性チェック失敗(checkConsistency が false を返す)
 *
 * すべて純関数。DBアクセスやAPI呼び出しは行わない。
 */

export type EscalationReason =
  | "parsed_null"
  | "low_confidence"
  | "many_dishes_low_confidence"
  | "consistency_failed";

export interface EscalationResult {
  shouldEscalate: boolean;
  reasons: EscalationReason[];
}

/** 4P+9F+4C と kcal の差が 30% 超、または total.kcal が [20, 3500] の範囲外なら失敗 */
export function checkConsistency(total: {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}): boolean {
  const { kcal, protein_g, fat_g, carbs_g } = total;

  if (kcal < 20 || kcal > 3500) {
    return false;
  }

  // kcal が 0 付近だと相対誤差が無限大になるため、
  // 上の範囲チェックを通過していれば kcal > 0 は保証される。
  const computed = 4 * protein_g + 9 * fat_g + 4 * carbs_g;
  const relativeDiff = Math.abs(computed - kcal) / kcal;

  return relativeDiff <= 0.3;
}

/** グラム重み付き平均confidence */
export function weightedAverageConfidence(
  dishes: { confidence: number; estimated_grams: number }[],
): number {
  if (dishes.length === 0) return 1;

  const totalGrams = dishes.reduce((sum, d) => sum + d.estimated_grams, 0);
  if (totalGrams <= 0) {
    // グラム情報が無意味な場合は単純平均にフォールバック
    return dishes.reduce((sum, d) => sum + d.confidence, 0) / dishes.length;
  }

  return dishes.reduce(
    (sum, d) => sum + d.confidence * (d.estimated_grams / totalGrams),
    0,
  );
}

/** 単純平均confidence */
export function averageConfidence(dishes: { confidence: number }[]): number {
  if (dishes.length === 0) return 1;
  return dishes.reduce((sum, d) => sum + d.confidence, 0) / dishes.length;
}

export interface EscalationInput {
  /** Haikuの parsed_output。両モデルでパース失敗した場合は null */
  parsed: Analysis | null;
  /**
   * Haikuで1回リトライした後の結果かどうか。
   * parsed === null かつ alreadyRetried === false の場合は
   * 「まずHaikuで1回リトライ」のフェーズなのでエスカレーションしない。
   */
  alreadyRetried: boolean;
}

export function evaluateEscalation(input: EscalationInput): EscalationResult {
  const { parsed, alreadyRetried } = input;
  const reasons: EscalationReason[] = [];

  if (parsed === null) {
    if (alreadyRetried) {
      reasons.push("parsed_null");
    }
    // リトライ未実施ならエスカレーション対象ではない(呼び出し側がリトライする)
    return { shouldEscalate: reasons.length > 0, reasons };
  }

  const { dishes, total } = parsed;

  // 条件2: min(confidence) < 0.45 または 重み付き平均 < 0.6
  if (dishes.length > 0) {
    const minConfidence = Math.min(...dishes.map((d) => d.confidence));
    const weightedAvg = weightedAverageConfidence(dishes);
    if (minConfidence < 0.45 || weightedAvg < 0.6) {
      reasons.push("low_confidence");
    }
  }

  // 条件3: dishes.length >= 4 かつ 平均confidence < 0.7
  if (dishes.length >= 4 && averageConfidence(dishes) < 0.7) {
    reasons.push("many_dishes_low_confidence");
  }

  // 条件4: 整合性チェック失敗
  if (!checkConsistency(total)) {
    reasons.push("consistency_failed");
  }

  return { shouldEscalate: reasons.length > 0, reasons };
}
