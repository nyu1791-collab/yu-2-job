/**
 * 分量スケーリング(PLAN.md §4.4 result.tsx の分量スライダー 0.5x〜2.0x線形再計算)。
 *
 * グラム数・kcal・PFCをすべて同じ比率で線形に再計算する純関数。
 */

export const PORTION_SCALE_MIN = 0.5;
export const PORTION_SCALE_MAX = 2.0;

export interface ScalableNutrition {
  grams: number;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

/**
 * scale (0.5〜2.0) を nutrition の各値に乗算する。
 * scale が範囲外の場合は [0.5, 2.0] にclampする。
 */
export function scalePortion<T extends ScalableNutrition>(
  nutrition: T,
  scale: number,
): T {
  const clamped = Math.min(PORTION_SCALE_MAX, Math.max(PORTION_SCALE_MIN, scale));
  return {
    ...nutrition,
    grams: nutrition.grams * clamped,
    kcal: nutrition.kcal * clamped,
    protein_g: nutrition.protein_g * clamped,
    fat_g: nutrition.fat_g * clamped,
    carbs_g: nutrition.carbs_g * clamped,
  };
}
