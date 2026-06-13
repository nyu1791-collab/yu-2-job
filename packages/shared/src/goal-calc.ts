/**
 * PFC目標計算(PLAN.md §4.3)。
 *
 * Mifflin-St Jeor 式で BMR を求め、活動係数 (1.2〜1.725) を掛けて TDEE を算出。
 *   減量(cut):    TDEE - 300 kcal
 *   維持(maintain): TDEE ± 0
 *   増量(bulk):    TDEE + 250 kcal
 *
 * P (タンパク質) = 体重(kg) × 2.0g (筋トレ層向け)
 * F (脂質)       = 総kcalの25%
 * C (炭水化物)   = 残りのkcalから算出
 */

export type GoalType = "cut" | "maintain" | "bulk";
export type Sex = "male" | "female";

/**
 * 活動レベル。Mifflin-St Jeor の一般的な活動係数に対応。
 *   sedentary:        ほぼ運動しない (1.2)
 *   light:            軽い運動 週1-3回 (1.375)
 *   moderate:         中程度の運動 週3-5回 (1.55)
 *   active:           激しい運動 週6-7回 (1.725)
 */
export type ActivityLevel = "sedentary" | "light" | "moderate" | "active";

export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
};

export const GOAL_KCAL_ADJUSTMENT: Record<GoalType, number> = {
  cut: -300,
  maintain: 0,
  bulk: 250,
};

export const PROTEIN_G_PER_KG = 2.0;
export const FAT_RATIO_OF_KCAL = 0.25;

export const KCAL_PER_G_PROTEIN = 4;
export const KCAL_PER_G_FAT = 9;
export const KCAL_PER_G_CARBS = 4;

export interface GoalCalcInput {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activityLevel: ActivityLevel;
  goalType: GoalType;
}

export interface GoalCalcResult {
  bmr: number;
  tdee: number;
  targetKcal: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbsG: number;
}

/**
 * Mifflin-St Jeor式によるBMR(基礎代謝量)。
 *   男性: 10×体重(kg) + 6.25×身長(cm) - 5×年齢 + 5
 *   女性: 10×体重(kg) + 6.25×身長(cm) - 5×年齢 - 161
 */
export function calculateBmr(input: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
}): number {
  const { weightKg, heightCm, age, sex } = input;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function calculateGoal(input: GoalCalcInput): GoalCalcResult {
  const { weightKg, heightCm, age, sex, activityLevel, goalType } = input;

  const bmr = calculateBmr({ weightKg, heightCm, age, sex });
  const tdee = bmr * ACTIVITY_FACTORS[activityLevel];
  const targetKcal = tdee + GOAL_KCAL_ADJUSTMENT[goalType];

  return {
    bmr,
    tdee,
    ...recalculatePfcForKcal({ targetKcal, proteinG: weightKg * PROTEIN_G_PER_KG }),
  };
}

/**
 * targetKcal(と固定のP)から F/C を再計算する。
 *   F (脂質)     = targetKcalの25%
 *   C (炭水化物) = 残りのkcalから算出(0未満はclamp)
 *
 * オンボーディングの目標カロリー微調整(±50kcal)や、
 * `/v1/me/goal` でのtargetKcal上書き保存に使う。
 */
export function recalculatePfcForKcal(input: {
  targetKcal: number;
  proteinG: number;
}): { targetKcal: number; targetProteinG: number; targetFatG: number; targetCarbsG: number } {
  const { targetKcal, proteinG } = input;

  const fatKcal = targetKcal * FAT_RATIO_OF_KCAL;
  const targetFatG = fatKcal / KCAL_PER_G_FAT;

  const proteinKcal = proteinG * KCAL_PER_G_PROTEIN;
  const remainingKcalForCarbs = targetKcal - proteinKcal - fatKcal;
  const targetCarbsG = Math.max(0, remainingKcalForCarbs / KCAL_PER_G_CARBS);

  return {
    targetKcal,
    targetProteinG: proteinG,
    targetFatG,
    targetCarbsG,
  };
}

/**
 * 計算済みの目標(`calculateGoal`の結果)から、targetKcalだけを差し替えて
 * P/F/Cを再計算する(bmr/tdeeは変更しない)。
 * オンボーディングの目標カロリー微調整UIで使用する。
 */
export function recalculateGoalWithKcal(base: GoalCalcResult, targetKcal: number): GoalCalcResult {
  return {
    bmr: base.bmr,
    tdee: base.tdee,
    ...recalculatePfcForKcal({ targetKcal, proteinG: base.targetProteinG }),
  };
}
