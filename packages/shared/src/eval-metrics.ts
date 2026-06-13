/**
 * 解析精度評価(`scripts/eval.ts`)用の純関数群(M6 / PLAN.md §5)。
 *
 * - kcal・P/F/Cの誤差%を計算する。
 * - DBアクセス・API呼び出しは行わない。
 */

/**
 * 実測値(actual)が期待値(expected)に対してどれだけ誤差があるかを%で返す。
 *
 * - `(actual - expected) / expected * 100` の絶対値ではなく符号付きで返す
 *   (過大評価か過小評価かをCSVで確認できるようにするため)。
 * - `expected` が 0 の場合、`actual` も 0 なら誤差0%、そうでなければ
 *   相対誤差が定義できないため `Infinity`(actualが正)または`-Infinity`
 *   (actualが負)を返す。呼び出し側で表示時にハンドリングする想定。
 */
export function computeErrorPercent(actual: number, expected: number): number {
  if (expected === 0) {
    if (actual === 0) {
      return 0;
    }
    return actual > 0 ? Infinity : -Infinity;
  }
  return ((actual - expected) / expected) * 100;
}

export interface PfcValues {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export interface PfcErrorPercent {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

/** kcal・P/F/Cそれぞれの誤差%をまとめて計算する。 */
export function computePfcErrorPercent(actual: PfcValues, expected: PfcValues): PfcErrorPercent {
  return {
    kcal: computeErrorPercent(actual.kcal, expected.kcal),
    protein_g: computeErrorPercent(actual.protein_g, expected.protein_g),
    fat_g: computeErrorPercent(actual.fat_g, expected.fat_g),
    carbs_g: computeErrorPercent(actual.carbs_g, expected.carbs_g),
  };
}

/**
 * 誤差%配列の中央値を計算する。
 *
 * - `Infinity`/`-Infinity`/`NaN` を含む値は中央値計算から除外する
 *   (expected===0のケースなど、外れ値として精度評価の母数に含めない)。
 * - 有効な値が無い場合は `null` を返す。
 */
export function medianErrorPercent(values: number[]): number | null {
  const finite = values.filter((v) => Number.isFinite(v));
  if (finite.length === 0) {
    return null;
  }
  const sorted = [...finite].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}
