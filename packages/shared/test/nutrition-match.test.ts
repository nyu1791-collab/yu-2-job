import { describe, expect, it } from "vitest";
import {
  clampConfidence,
  matchAnalysis,
  matchDish,
  normalizeFoodName,
  scaleNutrition,
  type FoodCandidate,
  type IngredientMatch,
} from "../src/nutrition-match.js";
import type { Analysis, Dish } from "../src/analysis-schema.js";

describe("normalizeFoodName", () => {
  it("全角英数を半角に正規化する (NFKC)", () => {
    expect(normalizeFoodName("ライス")).toBe(normalizeFoodName("ライス"));
    expect(normalizeFoodName("Ｒｉｃｅ")).toBe("rice");
  });

  it("空白(半角・全角)を除去する", () => {
    expect(normalizeFoodName("精白 米")).toBe("精白米");
    expect(normalizeFoodName("精白　米")).toBe("精白米");
  });

  it("カタカナをひらがな化する", () => {
    expect(normalizeFoodName("キャベツ")).toBe("きゃべつ");
  });

  it("複合的な正規化(空白除去+カタカナ→ひらがな+小文字化)", () => {
    expect(normalizeFoodName("木綿 豆腐")).toBe("木綿豆腐");
    expect(normalizeFoodName("セブン　サラダチキン")).toBe("せぶんさらだちきん");
  });
});

describe("scaleNutrition", () => {
  it("100gあたりの値からgrams分の栄養値を計算する", () => {
    const per100g = { kcal100g: 156, protein100g: 2.5, fat100g: 0.3, carbs100g: 35.6 };
    const result = scaleNutrition(per100g, 150);
    expect(result.kcal).toBeCloseTo(234, 5);
    expect(result.protein_g).toBeCloseTo(3.75, 5);
    expect(result.fat_g).toBeCloseTo(0.45, 5);
    expect(result.carbs_g).toBeCloseTo(53.4, 5);
  });
});

describe("clampConfidence", () => {
  it("0未満は0に、1超は1にclampする", () => {
    expect(clampConfidence(-0.5)).toBe(0);
    expect(clampConfidence(1.5)).toBe(1);
    expect(clampConfidence(0.7)).toBe(0.7);
  });

  it("NaNは0を返す", () => {
    expect(clampConfidence(NaN)).toBe(0);
  });
});

function makeDish(overrides: Partial<Dish> = {}): Dish {
  return {
    name: "白米",
    ingredients: [{ name: "精白米", grams: 150 }],
    estimated_grams: 150,
    kcal: 250, // AI推定(成分表値とはやや異なる想定)
    protein_g: 4,
    fat_g: 0.5,
    carbs_g: 55,
    confidence: 0.85,
    ...overrides,
  };
}

const RICE_CANDIDATE: FoodCandidate = {
  foodDbId: 1,
  name: "こめ [水稲穀粒] 精白米 うるち米",
  kcal100g: 156,
  protein100g: 2.5,
  fat100g: 0.3,
  carbs100g: 35.6,
  matchType: "exact",
};

describe("matchDish — カバレッジ70%以上 (corrected=true)", () => {
  it("マッチした食材は成分表値で栄養を再計算する", () => {
    const dish = makeDish();
    const matches: IngredientMatch[] = [
      { ingredient: dish.ingredients[0]!, candidate: RICE_CANDIDATE },
    ];

    const result = matchDish(dish, matches);

    expect(result.coverage).toBe(1);
    expect(result.dish.corrected).toBe(true);
    // 150g * 156kcal/100g = 234
    expect(result.dish.kcal).toBeCloseTo(234, 5);
    expect(result.dish.protein_g).toBeCloseTo(3.75, 5);
    expect(result.dish.fat_g).toBeCloseTo(0.45, 5);
    expect(result.dish.carbs_g).toBeCloseTo(53.4, 5);
    expect(result.dish.matched_product_id).toBeNull();
  });

  it("未マッチ分はAI値を按分して加算する", () => {
    const dish = makeDish({
      name: "焼き魚定食の主菜",
      ingredients: [
        { name: "精白米", grams: 150 }, // マッチする
        { name: "鯖", grams: 50 }, // マッチしない
      ],
      estimated_grams: 200,
      kcal: 400, // AI推定 合計
      protein_g: 20,
      fat_g: 10,
      carbs_g: 55,
      confidence: 0.8,
    });

    const matches: IngredientMatch[] = [
      { ingredient: dish.ingredients[0]!, candidate: RICE_CANDIDATE },
      { ingredient: dish.ingredients[1]!, candidate: null },
    ];

    const result = matchDish(dish, matches);

    // coverage = 150/200 = 0.75 (>=0.7 -> corrected)
    expect(result.coverage).toBeCloseTo(0.75, 5);
    expect(result.dish.corrected).toBe(true);

    // rice: 234kcal, 3.75P, 0.45F, 53.4C
    // unmatched 50g: AI per-gram = 400/200=2kcal/g -> 50g分=100kcal
    //   protein per-gram = 20/200=0.1 -> 50g分=5
    //   fat per-gram = 10/200=0.05 -> 50g分=2.5
    //   carbs per-gram = 55/200=0.275 -> 50g分=13.75
    expect(result.dish.kcal).toBeCloseTo(234 + 100, 5);
    expect(result.dish.protein_g).toBeCloseTo(3.75 + 5, 5);
    expect(result.dish.fat_g).toBeCloseTo(0.45 + 2.5, 5);
    expect(result.dish.carbs_g).toBeCloseTo(53.4 + 13.75, 5);
  });

  it("カバレッジちょうど70%でも補正される", () => {
    const dish = makeDish({
      ingredients: [
        { name: "精白米", grams: 70 },
        { name: "謎の食材", grams: 30 },
      ],
      estimated_grams: 100,
      kcal: 200,
      protein_g: 5,
      fat_g: 2,
      carbs_g: 30,
      confidence: 0.8,
    });
    const matches: IngredientMatch[] = [
      { ingredient: dish.ingredients[0]!, candidate: RICE_CANDIDATE },
      { ingredient: dish.ingredients[1]!, candidate: null },
    ];

    const result = matchDish(dish, matches);
    expect(result.coverage).toBeCloseTo(0.7, 5);
    expect(result.dish.corrected).toBe(true);
  });
});

describe("matchDish — カバレッジ70%未満 (corrected=false)", () => {
  it("AI値のまま返す", () => {
    const dish = makeDish({
      ingredients: [
        { name: "精白米", grams: 50 },
        { name: "謎の食材A", grams: 30 },
        { name: "謎の食材B", grams: 20 },
      ],
      estimated_grams: 100,
    });
    const matches: IngredientMatch[] = [
      { ingredient: dish.ingredients[0]!, candidate: RICE_CANDIDATE },
      { ingredient: dish.ingredients[1]!, candidate: null },
      { ingredient: dish.ingredients[2]!, candidate: null },
    ];

    const result = matchDish(dish, matches);

    // coverage = 50/100 = 0.5 < 0.7
    expect(result.coverage).toBeCloseTo(0.5, 5);
    expect(result.dish.corrected).toBe(false);
    expect(result.dish.kcal).toBe(dish.kcal);
    expect(result.dish.protein_g).toBe(dish.protein_g);
    expect(result.dish.fat_g).toBe(dish.fat_g);
    expect(result.dish.carbs_g).toBe(dish.carbs_g);
    expect(result.dish.matched_product_id).toBeNull();
  });

  it("マッチが1件もない場合 coverage=0、corrected=false", () => {
    const dish = makeDish();
    const matches: IngredientMatch[] = [
      { ingredient: dish.ingredients[0]!, candidate: null },
    ];
    const result = matchDish(dish, matches);
    expect(result.coverage).toBe(0);
    expect(result.dish.corrected).toBe(false);
  });
});

describe("matchDish — 40%乖離によるconfidence減点", () => {
  it("補正後kcalがAI推定と40%以上乖離した場合、confidenceを0.15減点しnotesを示す対象になる", () => {
    // AI推定 kcal=100 だが成分表突合の結果 234kcal (134%乖離)
    const dish = makeDish({
      kcal: 100,
      protein_g: 2,
      fat_g: 1,
      carbs_g: 20,
      confidence: 0.85,
    });
    const matches: IngredientMatch[] = [
      { ingredient: dish.ingredients[0]!, candidate: RICE_CANDIDATE },
    ];

    const result = matchDish(dish, matches);

    expect(result.dish.corrected).toBe(true);
    expect(result.dish.kcal).toBeCloseTo(234, 5);
    expect(result.lowConfidenceDeviation).toBe(true);
    expect(result.dish.confidence).toBeCloseTo(0.85 - 0.15, 5);
  });

  it("乖離が40%未満ならconfidenceを変更しない", () => {
    // AI推定 kcal=220, 補正後234kcal -> diff = 14/220 = 6.4% < 40%
    const dish = makeDish({ kcal: 220, confidence: 0.85 });
    const matches: IngredientMatch[] = [
      { ingredient: dish.ingredients[0]!, candidate: RICE_CANDIDATE },
    ];

    const result = matchDish(dish, matches);

    expect(result.lowConfidenceDeviation).toBe(false);
    expect(result.dish.confidence).toBeCloseTo(0.85, 5);
  });

  it("乖離がちょうど40%の境界では減点されない(>=40%で減点)", () => {
    // AI推定kcalをXとして |234-X|/X = 0.4 となるよう設定
    // 234 = 1.4X => X = 167.142857...
    const dish = makeDish({ kcal: 234 / 1.4, confidence: 0.9 });
    const matches: IngredientMatch[] = [
      { ingredient: dish.ingredients[0]!, candidate: RICE_CANDIDATE },
    ];
    const result = matchDish(dish, matches);
    expect(result.lowConfidenceDeviation).toBe(true);
    expect(result.dish.confidence).toBeCloseTo(0.9 - 0.15, 5);
  });
});

describe("matchAnalysis", () => {
  it("totalをdish補正後の合算で再計算する(AIのtotalは無視)", () => {
    const dish1 = makeDish({
      name: "白米",
      kcal: 250, // AI値(不正確)
      protein_g: 4,
      fat_g: 0.5,
      carbs_g: 55,
      confidence: 0.85,
    });
    const dish2 = makeDish({
      name: "白米おかわり",
      ingredients: [{ name: "精白米", grams: 100 }],
      estimated_grams: 100,
      kcal: 9999, // 明らかに不正なAI値(乖離テスト用)
      protein_g: 1,
      fat_g: 1,
      carbs_g: 1,
      confidence: 0.8,
    });

    const analysis: Analysis = {
      is_food: true,
      dishes: [dish1, dish2],
      total: { kcal: 9999999, protein_g: 0, fat_g: 0, carbs_g: 0 }, // AIのtotalは無視される
      meal_type: "lunch",
      notes: null,
    };

    const matchesPerDish: IngredientMatch[][] = [
      [{ ingredient: dish1.ingredients[0]!, candidate: RICE_CANDIDATE }],
      [{ ingredient: dish2.ingredients[0]!, candidate: RICE_CANDIDATE }],
    ];

    const result = matchAnalysis(analysis, matchesPerDish);

    // dish1: 150g -> 234kcal / 3.75P / 0.45F / 53.4C
    // dish2: 100g -> 156kcal / 2.5P / 0.3F / 35.6C
    expect(result.analysis.total.kcal).toBeCloseTo(234 + 156, 5);
    expect(result.analysis.total.protein_g).toBeCloseTo(3.75 + 2.5, 5);
    expect(result.analysis.total.fat_g).toBeCloseTo(0.45 + 0.3, 5);
    expect(result.analysis.total.carbs_g).toBeCloseTo(53.4 + 35.6, 5);

    // dish2は乖離が大きいので notes に追記される
    expect(result.anyLowConfidenceDeviation).toBe(true);
    expect(result.analysis.notes).toContain("量を確認してください");
  });

  it("dishesとmatchesPerDishの長さが一致しない場合エラーを投げる", () => {
    const dish = makeDish();
    const analysis: Analysis = {
      is_food: true,
      dishes: [dish],
      total: { kcal: 250, protein_g: 4, fat_g: 0.5, carbs_g: 55 },
      meal_type: "lunch",
      notes: null,
    };
    expect(() => matchAnalysis(analysis, [])).toThrow();
  });

  it("低confidence減点が無い場合はnotesを変更しない", () => {
    const dish = makeDish({ kcal: 234, confidence: 0.9 });
    const analysis: Analysis = {
      is_food: true,
      dishes: [dish],
      total: { kcal: 234, protein_g: 3.75, fat_g: 0.45, carbs_g: 53.4 },
      meal_type: "lunch",
      notes: "美味しそうです",
    };
    const matchesPerDish: IngredientMatch[][] = [
      [{ ingredient: dish.ingredients[0]!, candidate: RICE_CANDIDATE }],
    ];
    const result = matchAnalysis(analysis, matchesPerDish);
    expect(result.anyLowConfidenceDeviation).toBe(false);
    expect(result.analysis.notes).toBe("美味しそうです");
  });
});
