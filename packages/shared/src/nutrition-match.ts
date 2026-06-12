/**
 * 成分表突合(PLAN.md §4.2 — ハイブリッド方式の核心)。
 *
 * AIは「料理名・食材分解・グラム推定」までを担当し、栄養値はサーバ側で
 * 日本食品標準成分表(food_db)と突合して算出する。
 *
 * このファイルは DB 非依存の純関数として実装する。
 * food候補リスト(完全一致・別名・類似度上位など)は呼び出し側
 * (DBアクセス層)が用意し、引数として渡す設計とする。
 *
 * 処理の流れ:
 *   ① NFKC正規化・空白除去・ひらがな化 → normalizeFoodName()
 *   ② food_aliases完全一致 / ③ pg_trgm類似度上位1件(閾値0.45)
 *      → 呼び出し側がこれらを行い、FoodCandidate[] として渡す
 *   ④ dishごとにマッチ食材のグラム比カバレッジ計算:
 *      ≥70%なら 栄養値=Σ(成分表100g値×grams/100) + 未マッチ分はAI値按分
 *        → corrected=true
 *      <70%なら AI値のまま → corrected=false
 *   ⑤ 補正後kcalがAI推定と40%以上乖離なら confidence-0.15 + notes追記
 *   ⑥ totalはdish補正後の合算で再計算(AIのtotalは信用しない)
 */

import type { Analysis, CorrectedAnalysis, CorrectedDish, Dish, Ingredient } from "./analysis-schema.js";

export const COVERAGE_THRESHOLD = 0.7;
export const DEVIATION_THRESHOLD = 0.4;
export const CONFIDENCE_PENALTY = 0.15;
export const LOW_CONFIDENCE_NOTE = "量を確認してください";

/** 浮動小数点誤差の許容値(閾値境界の判定がfloatの丸め誤差で揺れないようにする) */
const FLOATING_POINT_EPSILON = 1e-9;

/**
 * NFKC正規化・空白除去・ひらがな化。
 *
 * - NFKC正規化(全角/半角・異体字の統一)
 * - 空白(半角・全角)の除去
 * - カタカナ → ひらがな変換
 * - 前後の記号類はそのまま(食品名の意味を保つため最小限の処理)
 */
export function normalizeFoodName(name: string): string {
  const nfkc = name.normalize("NFKC");
  const noSpace = nfkc.replace(/[\s　]+/g, "");
  const hiragana = katakanaToHiragana(noSpace);
  return hiragana.toLowerCase();
}

function katakanaToHiragana(input: string): string {
  let result = "";
  for (const ch of input) {
    const code = ch.codePointAt(0)!;
    // カタカナ範囲: U+30A1 - U+30F6 (ァ-ヶ)
    if (code >= 0x30a1 && code <= 0x30f6) {
      result += String.fromCodePoint(code - 0x60);
    } else {
      result += ch;
    }
  }
  return result;
}

/** food_db / food_aliases から得られる栄養100g値の候補 */
export interface FoodCandidate {
  /** food_db.id */
  foodDbId: number;
  /** 成分表上の名称 */
  name: string;
  kcal100g: number;
  protein100g: number;
  fat100g: number;
  carbs100g: number;
  /**
   * マッチ方法。完全一致(exact)・別名(alias)・類似度(trigram)。
   * trigramの場合は similarity が閾値0.45以上であることを呼び出し側が保証する。
   */
  matchType: "exact" | "alias" | "trigram";
  /** trigramマッチの場合の類似度 (0〜1) */
  similarity?: number;
}

/**
 * 食材1件に対するマッチ結果。
 * 呼び出し側(DBアクセス層)が ingredient ごとに候補を検索し、
 * 最良の候補(あれば)を渡す。
 */
export interface IngredientMatch {
  ingredient: Ingredient;
  candidate: FoodCandidate | null;
}

/** 100gあたりの栄養値から grams 分の栄養値を計算 */
export function scaleNutrition(
  per100g: { kcal100g: number; protein100g: number; fat100g: number; carbs100g: number },
  grams: number,
): { kcal: number; protein_g: number; fat_g: number; carbs_g: number } {
  const ratio = grams / 100;
  return {
    kcal: per100g.kcal100g * ratio,
    protein_g: per100g.protein100g * ratio,
    fat_g: per100g.fat100g * ratio,
    carbs_g: per100g.carbs100g * ratio,
  };
}

interface NutritionTotals {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

function addNutrition(a: NutritionTotals, b: NutritionTotals): NutritionTotals {
  return {
    kcal: a.kcal + b.kcal,
    protein_g: a.protein_g + b.protein_g,
    fat_g: a.fat_g + b.fat_g,
    carbs_g: a.carbs_g + b.carbs_g,
  };
}

const ZERO: NutritionTotals = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

/** AIが返したdish全体のAI推定栄養値(per gram) */
function aiPerGramNutrition(dish: Dish): NutritionTotals {
  const grams = dish.estimated_grams > 0 ? dish.estimated_grams : 1;
  return {
    kcal: dish.kcal / grams,
    protein_g: dish.protein_g / grams,
    fat_g: dish.fat_g / grams,
    carbs_g: dish.carbs_g / grams,
  };
}

export interface DishMatchResult {
  dish: CorrectedDish;
  /** マッチした食材のグラム比カバレッジ (0〜1) */
  coverage: number;
  /** 補正後kcalがAI推定と40%以上乖離してconfidenceを減点したか */
  lowConfidenceDeviation: boolean;
}

/**
 * dish単位の成分表突合。
 *
 * @param dish AIが返したdish
 * @param matches dish.ingredients それぞれに対応するマッチ結果(同じ順序・同じ長さであること)
 */
export function matchDish(dish: Dish, matches: IngredientMatch[]): DishMatchResult {
  const totalGrams = dish.ingredients.reduce((sum, ing) => sum + ing.grams, 0);

  const matchedGrams = matches
    .filter((m) => m.candidate !== null)
    .reduce((sum, m) => sum + m.ingredient.grams, 0);

  const coverage = totalGrams > 0 ? matchedGrams / totalGrams : 0;

  if (coverage < COVERAGE_THRESHOLD) {
    // カバレッジ不足: AI値のまま、corrected=false
    return {
      dish: {
        ...dish,
        confidence: clampConfidence(dish.confidence),
        corrected: false,
        matched_product_id: null,
      },
      coverage,
      lowConfidenceDeviation: false,
    };
  }

  // ④ カバレッジ70%以上: マッチ分は成分表値、未マッチ分はAI値按分
  let matchedNutrition: NutritionTotals = ZERO;
  for (const m of matches) {
    if (m.candidate) {
      matchedNutrition = addNutrition(
        matchedNutrition,
        scaleNutrition(m.candidate, m.ingredient.grams),
      );
    }
  }

  const unmatchedGrams = totalGrams - matchedGrams;
  const aiPerGram = aiPerGramNutrition(dish);
  const unmatchedNutrition: NutritionTotals = {
    kcal: aiPerGram.kcal * unmatchedGrams,
    protein_g: aiPerGram.protein_g * unmatchedGrams,
    fat_g: aiPerGram.fat_g * unmatchedGrams,
    carbs_g: aiPerGram.carbs_g * unmatchedGrams,
  };

  const corrected = addNutrition(matchedNutrition, unmatchedNutrition);

  // ⑤ 補正後kcalがAI推定と40%以上乖離なら confidence-0.15 + notes
  let confidence = clampConfidence(dish.confidence);
  let lowConfidenceFlag = false;
  if (dish.kcal > 0) {
    const deviation = Math.abs(corrected.kcal - dish.kcal) / dish.kcal;
    // 浮動小数点誤差により厳密に40.0%にならないケース(例: 234/1.4)を
    // 「40%丁度」として正しく判定できるよう、ごく小さい許容誤差を設ける。
    if (deviation >= DEVIATION_THRESHOLD - FLOATING_POINT_EPSILON) {
      confidence = clampConfidence(confidence - CONFIDENCE_PENALTY);
      lowConfidenceFlag = true;
    }
  }

  return {
    dish: {
      ...dish,
      kcal: corrected.kcal,
      protein_g: corrected.protein_g,
      fat_g: corrected.fat_g,
      carbs_g: corrected.carbs_g,
      confidence,
      corrected: true,
      matched_product_id: null,
    },
    coverage,
    lowConfidenceDeviation: lowConfidenceFlag,
  };
}

export function clampConfidence(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export interface MatchAnalysisResult {
  analysis: CorrectedAnalysis;
  /** confidence減点が発生したdishが1件以上あったか */
  anyLowConfidenceDeviation: boolean;
  /** dishごとのカバレッジ */
  coverages: number[];
}

/**
 * Analysis全体の突合。
 *
 * @param analysis AIのパース結果(is_food想定はtrueであること)
 * @param matchesPerDish dishes と同じ順序・同じ長さの IngredientMatch[][]
 */
export function matchAnalysis(
  analysis: Analysis,
  matchesPerDish: IngredientMatch[][],
): MatchAnalysisResult {
  if (analysis.dishes.length !== matchesPerDish.length) {
    throw new Error(
      `matchAnalysis: dishes.length (${analysis.dishes.length}) と matchesPerDish.length (${matchesPerDish.length}) が一致しません`,
    );
  }

  let anyLowConfidenceDeviation = false;
  const coverages: number[] = [];

  const correctedDishes: CorrectedDish[] = analysis.dishes.map((dish, i) => {
    const result = matchDish(dish, matchesPerDish[i] ?? []);
    coverages.push(result.coverage);
    if (result.lowConfidenceDeviation) {
      anyLowConfidenceDeviation = true;
    }
    return result.dish;
  });

  // ⑥ totalはdish補正後の合算で再計算(AIのtotalは信用しない)
  const total = correctedDishes.reduce(
    (sum, d) => ({
      kcal: sum.kcal + d.kcal,
      protein_g: sum.protein_g + d.protein_g,
      fat_g: sum.fat_g + d.fat_g,
      carbs_g: sum.carbs_g + d.carbs_g,
    }),
    ZERO,
  );

  let notes = analysis.notes;
  if (anyLowConfidenceDeviation) {
    notes = notes ? `${notes} ${LOW_CONFIDENCE_NOTE}` : LOW_CONFIDENCE_NOTE;
  }

  return {
    analysis: {
      ...analysis,
      dishes: correctedDishes,
      total,
      notes,
    },
    anyLowConfidenceDeviation,
    coverages,
  };
}
