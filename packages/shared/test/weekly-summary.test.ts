import { describe, expect, it } from "vitest";
import {
  addDaysToDateString,
  isDayAchieved,
  summarizeWeek,
  weekDateRange,
  type DailyGoalTargets,
  type DailyTotals,
} from "../src/weekly-summary.js";

const GOAL: DailyGoalTargets = {
  targetKcal: 2000,
  targetProteinG: 150,
  targetFatG: 55,
  targetCarbsG: 220,
};

describe("isDayAchieved", () => {
  it("kcalが目標±10%圏内 かつ Pが目標の90%以上なら達成", () => {
    const totals: DailyTotals = { kcal: 2100, protein_g: 140, fat_g: 50, carbs_g: 200 };
    expect(isDayAchieved(totals, GOAL)).toBe(true);
  });

  it("kcalが+10%を超えると未達成", () => {
    const totals: DailyTotals = { kcal: 2201, protein_g: 150, fat_g: 50, carbs_g: 200 };
    expect(isDayAchieved(totals, GOAL)).toBe(false);
  });

  it("kcalが-10%を下回ると未達成", () => {
    const totals: DailyTotals = { kcal: 1799, protein_g: 150, fat_g: 50, carbs_g: 200 };
    expect(isDayAchieved(totals, GOAL)).toBe(false);
  });

  it("kcalは圏内だがPが90%未満なら未達成", () => {
    const totals: DailyTotals = { kcal: 2000, protein_g: 134, fat_g: 50, carbs_g: 200 };
    // 150 * 0.9 = 135 -> 134は未満
    expect(isDayAchieved(totals, GOAL)).toBe(false);
  });

  it("ちょうど境界値(kcal+10%, P90%)は達成", () => {
    const totals: DailyTotals = { kcal: 2200, protein_g: 135, fat_g: 50, carbs_g: 200 };
    expect(isDayAchieved(totals, GOAL)).toBe(true);
  });

  it("totalsがnull(未記録の日)は未達成", () => {
    expect(isDayAchieved(null, GOAL)).toBe(false);
  });

  it("goalがnull(目標未設定)は未達成", () => {
    const totals: DailyTotals = { kcal: 2000, protein_g: 150, fat_g: 50, carbs_g: 200 };
    expect(isDayAchieved(totals, null)).toBe(false);
  });
});

describe("summarizeWeek", () => {
  it("複数日の平均PFC・達成日数を計算する", () => {
    const days = [
      { date: "2026-06-01", totals: { kcal: 2100, protein_g: 140, fat_g: 50, carbs_g: 200 }, goal: GOAL }, // 達成
      { date: "2026-06-02", totals: { kcal: 2500, protein_g: 100, fat_g: 80, carbs_g: 250 }, goal: GOAL }, // 未達成
      { date: "2026-06-03", totals: null, goal: GOAL }, // 未記録
      { date: "2026-06-04", totals: { kcal: 1900, protein_g: 140, fat_g: 50, carbs_g: 180 }, goal: GOAL }, // 達成
      { date: "2026-06-05", totals: { kcal: 2000, protein_g: 150, fat_g: 55, carbs_g: 220 }, goal: GOAL }, // 達成
      { date: "2026-06-06", totals: null, goal: GOAL }, // 未記録
      { date: "2026-06-07", totals: null, goal: GOAL }, // 未記録
    ];

    const result = summarizeWeek(days);

    expect(result.recordedDays).toBe(4);
    expect(result.achievedDays).toBe(3);

    // 平均 = (2100+2500+1900+2000)/4 = 2125
    expect(result.averages.kcal).toBeCloseTo(2125, 5);
    // (140+100+140+150)/4 = 132.5
    expect(result.averages.protein_g).toBeCloseTo(132.5, 5);

    expect(result.days).toHaveLength(7);
    expect(result.days[0]?.achieved).toBe(true);
    expect(result.days[1]?.achieved).toBe(false);
    expect(result.days[2]?.achieved).toBe(false);
  });

  it("記録が1日もない週は平均0・達成0日", () => {
    const days = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-06-0${i + 1}`,
      totals: null,
      goal: GOAL,
    }));

    const result = summarizeWeek(days);
    expect(result.recordedDays).toBe(0);
    expect(result.achievedDays).toBe(0);
    expect(result.averages).toEqual({ kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 });
  });

  it("goalがnullの日は記録があっても未達成", () => {
    const days = [
      { date: "2026-06-01", totals: { kcal: 2000, protein_g: 150, fat_g: 55, carbs_g: 220 }, goal: null },
    ];
    const result = summarizeWeek(days);
    expect(result.recordedDays).toBe(1);
    expect(result.achievedDays).toBe(0);
    expect(result.averages.kcal).toBeCloseTo(2000, 5);
  });
});

describe("addDaysToDateString / weekDateRange", () => {
  it("日付に加算できる(月末をまたぐ)", () => {
    expect(addDaysToDateString("2026-06-28", 1)).toBe("2026-06-29");
    expect(addDaysToDateString("2026-06-30", 1)).toBe("2026-07-01");
    expect(addDaysToDateString("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("weekDateRangeはstartから7日分を返す", () => {
    const range = weekDateRange("2026-06-08");
    expect(range).toEqual([
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
      "2026-06-12",
      "2026-06-13",
      "2026-06-14",
    ]);
  });
});
