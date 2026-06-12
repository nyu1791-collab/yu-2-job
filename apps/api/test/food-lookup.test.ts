/**
 * food-lookup + nutrition-match 統合テスト(M2)。
 *
 * PGlite上にマイグレーション+seedを適用したDBを使い、
 * ① alias完全一致 → 補正栄養値の算出
 * ② pg_trgm類似度一致(閾値0.45)
 * ③ カバレッジ70%未満 → AI値フォールバック(corrected=false)
 * を検証する。
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { matchAnalysis, type Analysis } from "@pashacaro/shared";
import type { Db } from "../src/db/client.js";
import { buildIngredientMatches, buildMatchesForDishes, findFoodCandidate } from "../src/lib/food-lookup.js";
import { setupTestDb } from "./helpers/db.js";

describe("food-lookup + matchAnalysis", () => {
  let db: Db;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  afterAll(async () => {
    const maybeClose = (db as unknown as { $client?: { close?: () => Promise<void> } }).$client;
    await maybeClose?.close?.();
  });

  it("(a) 「ごはん」はfood_aliases完全一致で精白米めしにマッチし、150gのkcalは成分表値から算出される", async () => {
    const candidate = await findFoodCandidate(db, "ごはん");
    expect(candidate).not.toBeNull();
    expect(candidate?.matchType).toBe("alias");
    expect(candidate?.name).toBe("精白米めし");
    // 精白米めし: kcal_100g = 156
    expect(candidate?.kcal100g).toBeCloseTo(156, 5);

    // matchAnalysis経由でdish全体を補正した場合のkcalも確認(150g -> 234kcal)
    const analysis: Analysis = {
      is_food: true,
      dishes: [
        {
          name: "ごはん",
          ingredients: [{ name: "ごはん", grams: 150 }],
          estimated_grams: 150,
          kcal: 230, // AI推定値(成分表値234との差は小さく、40%乖離にはならない)
          protein_g: 3.5,
          fat_g: 0.4,
          carbs_g: 53,
          confidence: 0.9,
        },
      ],
      total: { kcal: 230, protein_g: 3.5, fat_g: 0.4, carbs_g: 53 },
      meal_type: "lunch",
      notes: null,
    };

    const matchesPerDish = await buildMatchesForDishes(db, analysis.dishes);
    const result = matchAnalysis(analysis, matchesPerDish);

    expect(result.coverages[0]).toBeCloseTo(1, 5);
    const correctedDish = result.analysis.dishes[0];
    expect(correctedDish?.corrected).toBe(true);
    // 156 kcal/100g * 150g = 234
    expect(correctedDish?.kcal).toBeCloseTo(234, 5);
    expect(result.analysis.total.kcal).toBeCloseTo(234, 5);
  });

  it("(b) 別名・完全一致に該当しない名称はpg_trgm類似度(閾値0.45以上)で「たまねぎ」にマッチする", async () => {
    // "たまねぎ大" は food_aliases にも food_db.name_normalized にも存在しないが、
    // 正規化後の "たまねぎ" との類似度は0.45以上になる(事前にpg_trgmで確認済み)。
    const candidate = await findFoodCandidate(db, "たまねぎ大");
    expect(candidate).not.toBeNull();
    expect(candidate?.matchType).toBe("trigram");
    expect(candidate?.name).toBe("たまねぎ");
    expect(candidate?.similarity).toBeGreaterThanOrEqual(0.45);
    // たまねぎ: kcal_100g = 35
    expect(candidate?.kcal100g).toBeCloseTo(35, 5);
  });

  it("similarity閾値未満の名称はマッチしない(null)", async () => {
    // 食品名としてあまりに無関係な文字列はどのfood_dbとも0.45以上にならない想定。
    const candidate = await findFoodCandidate(db, "ｚｚｚｑｑｑｗｗｗ未知の物質");
    expect(candidate).toBeNull();
  });

  it("(c) カバレッジ70%未満の場合はAI値のまま(corrected=false)でフォールバックする", async () => {
    // ingredients 2件中、マッチするのは1件のみ(50g)。totalGramsは200gなので
    // カバレッジ = 50/200 = 25% < 70% -> AI値のまま
    const analysis: Analysis = {
      is_food: true,
      dishes: [
        {
          name: "謎の創作料理",
          ingredients: [
            { name: "ごはん", grams: 50 },
            { name: "未知の調味料ｚｚｚｑｑｑｗｗｗ", grams: 150 },
          ],
          estimated_grams: 200,
          kcal: 500,
          protein_g: 10,
          fat_g: 8,
          carbs_g: 60,
          confidence: 0.6,
        },
      ],
      total: { kcal: 500, protein_g: 10, fat_g: 8, carbs_g: 60 },
      meal_type: "dinner",
      notes: null,
    };

    const matchesPerDish = await buildMatchesForDishes(db, analysis.dishes);
    const result = matchAnalysis(analysis, matchesPerDish);

    expect(result.coverages[0]).toBeLessThan(0.7);
    const correctedDish = result.analysis.dishes[0];
    expect(correctedDish?.corrected).toBe(false);
    // AI値のまま
    expect(correctedDish?.kcal).toBeCloseTo(500, 5);
    expect(result.analysis.total.kcal).toBeCloseTo(500, 5);
  });

  it("buildIngredientMatches: 複数食材の候補をまとめて構築できる", async () => {
    const matches = await buildIngredientMatches(db, [
      { name: "ごはん", grams: 150 },
      { name: "たまねぎ大", grams: 30 },
    ]);
    expect(matches).toHaveLength(2);
    expect(matches[0]?.candidate?.matchType).toBe("alias");
    expect(matches[1]?.candidate?.matchType).toBe("trigram");
  });
});
