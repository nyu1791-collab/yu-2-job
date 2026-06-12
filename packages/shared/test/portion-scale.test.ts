import { describe, expect, it } from "vitest";
import { scalePortion, PORTION_SCALE_MAX, PORTION_SCALE_MIN } from "../src/portion-scale.js";

describe("scalePortion", () => {
  const base = { grams: 200, kcal: 300, protein_g: 20, fat_g: 10, carbs_g: 30 };

  it("1.5倍でgrams/kcal/PFCすべてが1.5倍になる", () => {
    const result = scalePortion(base, 1.5);
    expect(result.grams).toBeCloseTo(300, 5);
    expect(result.kcal).toBeCloseTo(450, 5);
    expect(result.protein_g).toBeCloseTo(30, 5);
    expect(result.fat_g).toBeCloseTo(15, 5);
    expect(result.carbs_g).toBeCloseTo(45, 5);
  });

  it("0.5倍(最小値)で半分になる", () => {
    const result = scalePortion(base, 0.5);
    expect(result.kcal).toBeCloseTo(150, 5);
  });

  it("2.0倍(最大値)で2倍になる", () => {
    const result = scalePortion(base, 2.0);
    expect(result.kcal).toBeCloseTo(600, 5);
  });

  it("範囲外の値は0.5〜2.0にclampされる", () => {
    const tooLow = scalePortion(base, 0.1);
    expect(tooLow.kcal).toBeCloseTo(base.kcal * PORTION_SCALE_MIN, 5);

    const tooHigh = scalePortion(base, 5);
    expect(tooHigh.kcal).toBeCloseTo(base.kcal * PORTION_SCALE_MAX, 5);
  });

  it("元のオブジェクトを変更しない(イミュータブル)", () => {
    const copy = { ...base };
    scalePortion(base, 1.5);
    expect(base).toEqual(copy);
  });
});
