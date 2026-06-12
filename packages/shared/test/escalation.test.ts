import { describe, expect, it } from "vitest";
import {
  averageConfidence,
  checkConsistency,
  evaluateEscalation,
  weightedAverageConfidence,
} from "../src/escalation.js";
import type { Analysis, Dish } from "../src/analysis-schema.js";

function makeDish(overrides: Partial<Dish> = {}): Dish {
  return {
    name: "白米",
    ingredients: [{ name: "精白米", grams: 150 }],
    estimated_grams: 150,
    kcal: 234,
    protein_g: 3.8,
    fat_g: 0.5,
    carbs_g: 53.4,
    confidence: 0.9,
    ...overrides,
  };
}

function makeAnalysis(dishes: Dish[], total?: Analysis["total"]): Analysis {
  const computedTotal =
    total ??
    dishes.reduce(
      (sum, d) => ({
        kcal: sum.kcal + d.kcal,
        protein_g: sum.protein_g + d.protein_g,
        fat_g: sum.fat_g + d.fat_g,
        carbs_g: sum.carbs_g + d.carbs_g,
      }),
      { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
    );

  return {
    is_food: true,
    dishes,
    total: computedTotal,
    meal_type: "lunch",
    notes: null,
  };
}

describe("checkConsistency", () => {
  it("returns true for a consistent total within range", () => {
    // 4*3.8 + 9*0.5 + 4*53.4 = 15.2 + 4.5 + 213.6 = 233.3, kcal=234 -> diff ~0.3%
    expect(
      checkConsistency({ kcal: 234, protein_g: 3.8, fat_g: 0.5, carbs_g: 53.4 }),
    ).toBe(true);
  });

  it("returns false when kcal is below 20", () => {
    expect(checkConsistency({ kcal: 10, protein_g: 0, fat_g: 0, carbs_g: 2 })).toBe(
      false,
    );
  });

  it("returns false when kcal is above 3500", () => {
    expect(
      checkConsistency({ kcal: 4000, protein_g: 100, fat_g: 100, carbs_g: 500 }),
    ).toBe(false);
  });

  it("returns false when 4P+9F+4C deviates from kcal by more than 30%", () => {
    // computed = 4*10 + 9*0 + 4*0 = 40, kcal = 100 -> diff = 60% > 30%
    expect(checkConsistency({ kcal: 100, protein_g: 10, fat_g: 0, carbs_g: 0 })).toBe(
      false,
    );
  });

  it("returns true when deviation is exactly at the 30% boundary", () => {
    // computed = 130, kcal = 100 -> diff = 30% (<=30% is allowed)
    expect(checkConsistency({ kcal: 100, protein_g: 32.5, fat_g: 0, carbs_g: 0 })).toBe(
      true,
    );
  });
});

describe("weightedAverageConfidence / averageConfidence", () => {
  it("computes gram-weighted average confidence", () => {
    const dishes = [
      { confidence: 0.9, estimated_grams: 100 },
      { confidence: 0.5, estimated_grams: 300 },
    ];
    // (0.9*100 + 0.5*300) / 400 = (90+150)/400 = 0.6
    expect(weightedAverageConfidence(dishes)).toBeCloseTo(0.6, 5);
  });

  it("falls back to simple average when total grams is 0", () => {
    const dishes = [
      { confidence: 0.8, estimated_grams: 0 },
      { confidence: 0.4, estimated_grams: 0 },
    ];
    expect(weightedAverageConfidence(dishes)).toBeCloseTo(0.6, 5);
  });

  it("computes simple average confidence", () => {
    const dishes = [{ confidence: 0.8 }, { confidence: 0.6 }];
    expect(averageConfidence(dishes)).toBeCloseTo(0.7, 5);
  });

  it("returns 1 for empty dish list", () => {
    expect(weightedAverageConfidence([])).toBe(1);
    expect(averageConfidence([])).toBe(1);
  });
});

describe("evaluateEscalation", () => {
  it("条件1: parsed===null かつ alreadyRetried=true -> エスカレーション", () => {
    const result = evaluateEscalation({ parsed: null, alreadyRetried: true });
    expect(result.shouldEscalate).toBe(true);
    expect(result.reasons).toEqual(["parsed_null"]);
  });

  it("条件1: parsed===null かつ alreadyRetried=false -> エスカレーションしない(リトライ待ち)", () => {
    const result = evaluateEscalation({ parsed: null, alreadyRetried: false });
    expect(result.shouldEscalate).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("条件2: min(confidence) < 0.45 -> エスカレーション", () => {
    const analysis = makeAnalysis([
      makeDish({ confidence: 0.9, estimated_grams: 100 }),
      makeDish({ confidence: 0.4, estimated_grams: 100 }),
    ]);
    const result = evaluateEscalation({ parsed: analysis, alreadyRetried: false });
    expect(result.shouldEscalate).toBe(true);
    expect(result.reasons).toContain("low_confidence");
  });

  it("条件2: グラム重み付き平均confidence < 0.6 -> エスカレーション", () => {
    const analysis = makeAnalysis([
      makeDish({ confidence: 0.5, estimated_grams: 100 }),
      makeDish({ confidence: 0.5, estimated_grams: 300 }),
    ]);
    // weighted avg = 0.5, min = 0.5 (>= 0.45) but weighted avg < 0.6
    const result = evaluateEscalation({ parsed: analysis, alreadyRetried: false });
    expect(result.shouldEscalate).toBe(true);
    expect(result.reasons).toContain("low_confidence");
  });

  it("条件3: dishes.length >= 4 かつ 平均confidence < 0.7 -> エスカレーション", () => {
    const analysis = makeAnalysis([
      makeDish({ confidence: 0.65, estimated_grams: 100 }),
      makeDish({ confidence: 0.65, estimated_grams: 100 }),
      makeDish({ confidence: 0.65, estimated_grams: 100 }),
      makeDish({ confidence: 0.65, estimated_grams: 100 }),
    ]);
    const result = evaluateEscalation({ parsed: analysis, alreadyRetried: false });
    expect(result.shouldEscalate).toBe(true);
    expect(result.reasons).toContain("many_dishes_low_confidence");
  });

  it("条件3: dishes.length >= 4 だが平均confidence >= 0.7 -> 発火しない", () => {
    const analysis = makeAnalysis([
      makeDish({ confidence: 0.9, estimated_grams: 100 }),
      makeDish({ confidence: 0.8, estimated_grams: 100 }),
      makeDish({ confidence: 0.75, estimated_grams: 100 }),
      makeDish({ confidence: 0.95, estimated_grams: 100 }),
    ]);
    const result = evaluateEscalation({ parsed: analysis, alreadyRetried: false });
    expect(result.reasons).not.toContain("many_dishes_low_confidence");
  });

  it("条件4: 整合性チェック失敗 -> エスカレーション", () => {
    const analysis = makeAnalysis(
      [makeDish({ confidence: 0.9, estimated_grams: 100 })],
      { kcal: 100, protein_g: 10, fat_g: 0, carbs_g: 0 }, // computed=40, diff=60%
    );
    const result = evaluateEscalation({ parsed: analysis, alreadyRetried: false });
    expect(result.shouldEscalate).toBe(true);
    expect(result.reasons).toContain("consistency_failed");
  });

  it("すべての条件を満たさない場合はエスカレーションしない", () => {
    const analysis = makeAnalysis([
      makeDish({ confidence: 0.9, estimated_grams: 150 }),
      makeDish({ confidence: 0.85, estimated_grams: 150 }),
    ]);
    const result = evaluateEscalation({ parsed: analysis, alreadyRetried: false });
    expect(result.shouldEscalate).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it("複数の条件が同時に発火する場合はすべて理由に含む", () => {
    const analysis = makeAnalysis(
      [
        makeDish({ confidence: 0.3, estimated_grams: 100 }),
        makeDish({ confidence: 0.3, estimated_grams: 100 }),
        makeDish({ confidence: 0.3, estimated_grams: 100 }),
        makeDish({ confidence: 0.3, estimated_grams: 100 }),
      ],
      { kcal: 100, protein_g: 10, fat_g: 0, carbs_g: 0 },
    );
    const result = evaluateEscalation({ parsed: analysis, alreadyRetried: false });
    expect(result.shouldEscalate).toBe(true);
    expect(result.reasons).toContain("low_confidence");
    expect(result.reasons).toContain("many_dishes_low_confidence");
    expect(result.reasons).toContain("consistency_failed");
  });
});
