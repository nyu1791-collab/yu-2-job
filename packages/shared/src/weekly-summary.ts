/**
 * 週次サマリー集計(PLAN.md §4.5 GET /v1/summary/weekly)。
 *
 * 1日ごとのPFC合計と、その日に有効だった目標から「達成」を判定する純関数。
 *
 * 達成の定義:
 *   - kcal が目標の ±10% 圏内
 *   - かつ protein_g が目標の90%以上
 *
 * 平均PFCは「記録がある日」(totalsが存在する日)のみを対象に計算する。
 * 記録が1日もない週は平均は0として返す。
 */

export interface DailyTotals {
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

export interface DailyGoalTargets {
  targetKcal: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbsG: number;
}

export interface DaySummaryInput {
  /** YYYY-MM-DD (Asia/Tokyo) */
  date: string;
  /** その日の記録合計。記録がない日はnull */
  totals: DailyTotals | null;
  /** その日時点で有効な目標。未設定の場合はnull(達成判定の対象外) */
  goal: DailyGoalTargets | null;
}

export interface DaySummaryResult extends DaySummaryInput {
  /** kcal±10%圏内 かつ Pが目標の90%以上 を満たすか。記録or目標が無い日は false */
  achieved: boolean;
}

export const KCAL_ACHIEVEMENT_TOLERANCE = 0.1; // ±10%
export const PROTEIN_ACHIEVEMENT_RATIO = 0.9; // 90%以上

/**
 * 1日分の記録合計と目標から「達成」かどうかを判定する。
 *
 * - totals または goal が無い場合は false(未記録 or 目標未設定の日は達成にならない)
 * - kcal が targetKcal の ±10% 圏内
 * - かつ protein_g が targetProteinG の90%以上
 */
export function isDayAchieved(totals: DailyTotals | null, goal: DailyGoalTargets | null): boolean {
  if (!totals || !goal) {
    return false;
  }
  if (goal.targetKcal <= 0) {
    return false;
  }

  const kcalLower = goal.targetKcal * (1 - KCAL_ACHIEVEMENT_TOLERANCE);
  const kcalUpper = goal.targetKcal * (1 + KCAL_ACHIEVEMENT_TOLERANCE);
  const kcalOk = totals.kcal >= kcalLower && totals.kcal <= kcalUpper;

  const proteinOk = totals.protein_g >= goal.targetProteinG * PROTEIN_ACHIEVEMENT_RATIO;

  return kcalOk && proteinOk;
}

export interface WeeklySummaryResult {
  days: DaySummaryResult[];
  /** 記録がある日数の平均PFC(記録が無い週は全て0) */
  averages: DailyTotals;
  /** 達成日数(7日中) */
  achievedDays: number;
  /** 記録がある日数 */
  recordedDays: number;
}

/**
 * 7日分のDaySummaryInputから、各日の達成判定 + 週次平均PFC + 達成日数を計算する。
 */
export function summarizeWeek(days: DaySummaryInput[]): WeeklySummaryResult {
  const dayResults: DaySummaryResult[] = days.map((day) => ({
    ...day,
    achieved: isDayAchieved(day.totals, day.goal),
  }));

  const recordedDays = dayResults.filter((d) => d.totals !== null);
  const recordedCount = recordedDays.length;

  const sum = recordedDays.reduce(
    (acc, d) => {
      const totals = d.totals as DailyTotals;
      return {
        kcal: acc.kcal + totals.kcal,
        protein_g: acc.protein_g + totals.protein_g,
        fat_g: acc.fat_g + totals.fat_g,
        carbs_g: acc.carbs_g + totals.carbs_g,
      };
    },
    { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
  );

  const averages: DailyTotals =
    recordedCount > 0
      ? {
          kcal: sum.kcal / recordedCount,
          protein_g: sum.protein_g / recordedCount,
          fat_g: sum.fat_g / recordedCount,
          carbs_g: sum.carbs_g / recordedCount,
        }
      : { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

  const achievedDays = dayResults.filter((d) => d.achieved).length;

  return {
    days: dayResults,
    averages,
    achievedDays,
    recordedDays: recordedCount,
  };
}

/**
 * "YYYY-MM-DD" (Asia/Tokyo) の日付文字列に days 日加算した日付文字列を返す。
 * 日付計算はUTC基準のDateで行うが、文字列はそのままYYYY-MM-DD形式で扱うため
 * タイムゾーンの影響を受けない(カレンダー日付の加減算のみ)。
 */
export function addDaysToDateString(date: string, days: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) {
    throw new Error(`Invalid date string: ${date}`);
  }
  const [, yearStr, monthStr, dayStr] = match;
  const y = Number(yearStr);
  const m = Number(monthStr);
  const d = Number(dayStr);

  const base = new Date(Date.UTC(y, m - 1, d));
  base.setUTCDate(base.getUTCDate() + days);

  const ry = base.getUTCFullYear();
  const rm = String(base.getUTCMonth() + 1).padStart(2, "0");
  const rd = String(base.getUTCDate()).padStart(2, "0");
  return `${ry}-${rm}-${rd}`;
}

/** start から7日分の "YYYY-MM-DD" 配列を返す。 */
export function weekDateRange(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDaysToDateString(start, i));
}
