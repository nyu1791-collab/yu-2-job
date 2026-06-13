import { describe, expect, it } from "vitest";
import { computeErrorPercent, computePfcErrorPercent, medianErrorPercent } from "../src/eval-metrics.js";

describe("computeErrorPercent", () => {
  it("実測値が期待値より大きい場合は正の%を返す", () => {
    expect(computeErrorPercent(120, 100)).toBeCloseTo(20, 10);
  });

  it("実測値が期待値より小さい場合は負の%を返す", () => {
    expect(computeErrorPercent(80, 100)).toBeCloseTo(-20, 10);
  });

  it("実測値と期待値が一致する場合は0", () => {
    expect(computeErrorPercent(100, 100)).toBe(0);
  });

  it("期待値が0で実測値も0の場合は0", () => {
    expect(computeErrorPercent(0, 0)).toBe(0);
  });

  it("期待値が0で実測値が正の場合はInfinity", () => {
    expect(computeErrorPercent(10, 0)).toBe(Infinity);
  });

  it("期待値が0で実測値が負の場合は-Infinity", () => {
    expect(computeErrorPercent(-10, 0)).toBe(-Infinity);
  });
});

describe("computePfcErrorPercent", () => {
  it("kcal/P/F/Cそれぞれの誤差%を計算する", () => {
    const actual = { kcal: 550, protein_g: 22, fat_g: 18, carbs_g: 60 };
    const expected = { kcal: 500, protein_g: 20, fat_g: 20, carbs_g: 60 };
    const result = computePfcErrorPercent(actual, expected);
    expect(result.kcal).toBeCloseTo(10, 10);
    expect(result.protein_g).toBeCloseTo(10, 10);
    expect(result.fat_g).toBeCloseTo(-10, 10);
    expect(result.carbs_g).toBe(0);
  });
});

describe("medianErrorPercent", () => {
  it("奇数個の配列の中央値を返す", () => {
    expect(medianErrorPercent([10, -5, 20])).toBe(10);
  });

  it("偶数個の配列は中央2値の平均を返す", () => {
    expect(medianErrorPercent([10, 20, 30, 40])).toBe(25);
  });

  it("InfinityやNaNを除外して計算する", () => {
    expect(medianErrorPercent([10, Infinity, -Infinity, NaN, 20])).toBe(15);
  });

  it("有効な値が無い場合はnullを返す", () => {
    expect(medianErrorPercent([Infinity, -Infinity, NaN])).toBeNull();
  });

  it("空配列の場合はnullを返す", () => {
    expect(medianErrorPercent([])).toBeNull();
  });
});
