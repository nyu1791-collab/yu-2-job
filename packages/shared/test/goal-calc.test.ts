import { describe, expect, it } from "vitest";
import {
  calculateBmr,
  calculateGoal,
  recalculateGoalWithKcal,
  recalculatePfcForKcal,
} from "../src/goal-calc.js";

describe("calculateBmr", () => {
  it("男性のBMRを計算する (Mifflin-St Jeor)", () => {
    // 10*70 + 6.25*175 - 5*30 + 5 = 700 + 1093.75 - 150 + 5 = 1648.75
    const bmr = calculateBmr({ weightKg: 70, heightCm: 175, age: 30, sex: "male" });
    expect(bmr).toBeCloseTo(1648.75, 2);
  });

  it("女性のBMRを計算する (Mifflin-St Jeor)", () => {
    // 10*55 + 6.25*160 - 5*25 - 161 = 550 + 1000 - 125 - 161 = 1264
    const bmr = calculateBmr({ weightKg: 55, heightCm: 160, age: 25, sex: "female" });
    expect(bmr).toBeCloseTo(1264, 2);
  });
});

describe("calculateGoal", () => {
  it("減量(cut): TDEEから300kcal引く。Pは体重×2.0g、Fは総kcalの25%", () => {
    const result = calculateGoal({
      weightKg: 70,
      heightCm: 175,
      age: 30,
      sex: "male",
      activityLevel: "moderate", // 1.55
      goalType: "cut",
    });

    const expectedBmr = 1648.75;
    const expectedTdee = expectedBmr * 1.55; // 2555.5625
    const expectedTargetKcal = expectedTdee - 300; // 2255.5625

    expect(result.bmr).toBeCloseTo(expectedBmr, 2);
    expect(result.tdee).toBeCloseTo(expectedTdee, 2);
    expect(result.targetKcal).toBeCloseTo(expectedTargetKcal, 2);

    // P = 70 * 2.0 = 140g
    expect(result.targetProteinG).toBeCloseTo(140, 5);

    // F = targetKcal * 0.25 / 9
    const expectedFatG = (expectedTargetKcal * 0.25) / 9;
    expect(result.targetFatG).toBeCloseTo(expectedFatG, 5);

    // C = (targetKcal - P*4 - F*9) / 4
    const expectedCarbsG =
      (expectedTargetKcal - 140 * 4 - expectedFatG * 9) / 4;
    expect(result.targetCarbsG).toBeCloseTo(expectedCarbsG, 5);
  });

  it("維持(maintain): TDEEを変更しない", () => {
    const result = calculateGoal({
      weightKg: 60,
      heightCm: 165,
      age: 28,
      sex: "female",
      activityLevel: "light", // 1.375
      goalType: "maintain",
    });

    const expectedBmr = 10 * 60 + 6.25 * 165 - 5 * 28 - 161; // 600+1031.25-140-161=1330.25
    const expectedTdee = expectedBmr * 1.375;

    expect(result.bmr).toBeCloseTo(expectedBmr, 2);
    expect(result.targetKcal).toBeCloseTo(expectedTdee, 2);
  });

  it("増量(bulk): TDEEに250kcal加える", () => {
    const result = calculateGoal({
      weightKg: 80,
      heightCm: 180,
      age: 24,
      sex: "male",
      activityLevel: "active", // 1.725
      goalType: "bulk",
    });

    const expectedBmr = 10 * 80 + 6.25 * 180 - 5 * 24 + 5; // 800+1125-120+5=1810
    const expectedTdee = expectedBmr * 1.725;
    const expectedTargetKcal = expectedTdee + 250;

    expect(result.bmr).toBeCloseTo(expectedBmr, 2);
    expect(result.tdee).toBeCloseTo(expectedTdee, 2);
    expect(result.targetKcal).toBeCloseTo(expectedTargetKcal, 2);
  });

  it("炭水化物が負にならないようclampされる", () => {
    // 極端に低体重・低身長・低年齢・低活動量で targetKcal が小さく、
    // P(体重*2)とF(25%)だけでkcalを超えるケースでも0以上を返す
    const result = calculateGoal({
      weightKg: 100,
      heightCm: 150,
      age: 80,
      sex: "female",
      activityLevel: "sedentary",
      goalType: "cut",
    });
    expect(result.targetCarbsG).toBeGreaterThanOrEqual(0);
  });
});

describe("recalculatePfcForKcal", () => {
  it("Pを固定し、Fは25%、Cは残りから算出する", () => {
    const result = recalculatePfcForKcal({ targetKcal: 2000, proteinG: 140 });

    expect(result.targetKcal).toBe(2000);
    expect(result.targetProteinG).toBe(140);

    const expectedFatG = (2000 * 0.25) / 9;
    expect(result.targetFatG).toBeCloseTo(expectedFatG, 5);

    const expectedCarbsG = (2000 - 140 * 4 - expectedFatG * 9) / 4;
    expect(result.targetCarbsG).toBeCloseTo(expectedCarbsG, 5);
  });

  it("炭水化物が負にならないようclampされる", () => {
    // P=200g(800kcal)+F=25%(500kcal)=1300kcal > targetKcal=1000kcal
    const result = recalculatePfcForKcal({ targetKcal: 1000, proteinG: 200 });
    expect(result.targetCarbsG).toBe(0);
  });
});

describe("recalculateGoalWithKcal", () => {
  it("bmr/tdee/Pを変えずにtargetKcalだけ差し替えてF/Cを再計算する", () => {
    const base = calculateGoal({
      weightKg: 70,
      heightCm: 175,
      age: 30,
      sex: "male",
      activityLevel: "moderate",
      goalType: "cut",
    });

    const adjusted = recalculateGoalWithKcal(base, base.targetKcal + 50);

    expect(adjusted.bmr).toBe(base.bmr);
    expect(adjusted.tdee).toBe(base.tdee);
    expect(adjusted.targetProteinG).toBe(base.targetProteinG);
    expect(adjusted.targetKcal).toBeCloseTo(base.targetKcal + 50, 5);
    expect(adjusted.targetFatG).not.toBeCloseTo(base.targetFatG, 5);
  });
});
