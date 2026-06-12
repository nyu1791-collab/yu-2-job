/**
 * 成分表突合のDBクエリ層(PLAN.md §4.2)。
 *
 * 正規化した食材名で
 *   ① food_aliases 完全一致
 *   ② pg_trgm similarity 上位1件(閾値0.45)
 * を検索し、`@pashacaro/shared` の `nutrition-match` 純関数(候補リストを
 * 引数で受け取る既存設計)に渡せる `FoodCandidate` を返す。
 *
 * DBアクセスはこのファイルに閉じ込め、突合の決定的ロジックは
 * packages/shared/src/nutrition-match.ts の純関数側に置く。
 */

import { sql } from "drizzle-orm";
import { normalizeFoodName, type FoodCandidate, type Ingredient, type IngredientMatch } from "@pashacaro/shared";
import { dbRows, type Db } from "../db/client.js";

/** pg_trgm similarity の採用閾値(PLAN.md §4.2 ③)。 */
export const TRIGRAM_SIMILARITY_THRESHOLD = 0.45;

interface FoodDbRow {
  [key: string]: unknown;
  id: number;
  name: string;
  kcal_100g: number;
  protein_100g: number;
  fat_100g: number;
  carbs_100g: number;
}

interface AliasRow extends FoodDbRow {
  food_db_id: number;
}

interface TrigramRow extends FoodDbRow {
  similarity: number;
}

/**
 * 正規化済み食材名1件に対し、food_aliases完全一致 -> pg_trgm類似度上位1件の順で
 * 候補(FoodCandidate)を検索する。見つからなければ null。
 */
export async function findFoodCandidate(db: Db, ingredientName: string): Promise<FoodCandidate | null> {
  const normalized = normalizeFoodName(ingredientName);
  if (normalized.length === 0) {
    return null;
  }

  // ① food_aliases 完全一致(alias は正規化済み文字列で保存されている)
  const aliasResult = await db.execute<AliasRow>(sql`
    SELECT fd.id, fd.name, fd.kcal_100g, fd.protein_100g, fd.fat_100g, fd.carbs_100g, fa.food_db_id
    FROM food_aliases fa
    JOIN food_db fd ON fd.id = fa.food_db_id
    WHERE fa.alias = ${normalized}
    LIMIT 1
  `);

  const aliasRow = dbRows<AliasRow>(aliasResult)[0];
  if (aliasRow) {
    return {
      foodDbId: Number(aliasRow.id),
      name: aliasRow.name,
      kcal100g: Number(aliasRow.kcal_100g),
      protein100g: Number(aliasRow.protein_100g),
      fat100g: Number(aliasRow.fat_100g),
      carbs100g: Number(aliasRow.carbs_100g),
      matchType: "alias",
    };
  }

  // ① の前に food_db.name_normalized 自体への完全一致も試す
  // (例: AIが "精白米めし" のように成分表表記そのものを返した場合)
  const exactResult = await db.execute<FoodDbRow>(sql`
    SELECT id, name, kcal_100g, protein_100g, fat_100g, carbs_100g
    FROM food_db
    WHERE name_normalized = ${normalized}
    LIMIT 1
  `);
  const exactRow = dbRows<FoodDbRow>(exactResult)[0];
  if (exactRow) {
    return {
      foodDbId: Number(exactRow.id),
      name: exactRow.name,
      kcal100g: Number(exactRow.kcal_100g),
      protein100g: Number(exactRow.protein_100g),
      fat100g: Number(exactRow.fat_100g),
      carbs100g: Number(exactRow.carbs_100g),
      matchType: "exact",
    };
  }

  // ② pg_trgm similarity 上位1件(閾値0.45以上)
  const trigramResult = await db.execute<TrigramRow>(sql`
    SELECT id, name, kcal_100g, protein_100g, fat_100g, carbs_100g,
           similarity(name_normalized, ${normalized}) AS similarity
    FROM food_db
    WHERE similarity(name_normalized, ${normalized}) >= ${TRIGRAM_SIMILARITY_THRESHOLD}
    ORDER BY similarity DESC
    LIMIT 1
  `);
  const trigramRow = dbRows<TrigramRow>(trigramResult)[0];
  if (trigramRow) {
    return {
      foodDbId: Number(trigramRow.id),
      name: trigramRow.name,
      kcal100g: Number(trigramRow.kcal_100g),
      protein100g: Number(trigramRow.protein_100g),
      fat100g: Number(trigramRow.fat_100g),
      carbs100g: Number(trigramRow.carbs_100g),
      matchType: "trigram",
      similarity: Number(trigramRow.similarity),
    };
  }

  return null;
}

/**
 * dish.ingredients 1件ずつに対して findFoodCandidate を実行し、
 * nutrition-match の matchAnalysis に渡せる IngredientMatch[] を構築する。
 */
export async function buildIngredientMatches(db: Db, ingredients: Ingredient[]): Promise<IngredientMatch[]> {
  const matches: IngredientMatch[] = [];
  for (const ingredient of ingredients) {
    const candidate = await findFoodCandidate(db, ingredient.name);
    matches.push({ ingredient, candidate });
  }
  return matches;
}

/**
 * Analysis全体(dishes配列)に対して、dishごとのIngredientMatch[][]を構築する。
 */
export async function buildMatchesForDishes(
  db: Db,
  dishes: { ingredients: Ingredient[] }[],
): Promise<IngredientMatch[][]> {
  const result: IngredientMatch[][] = [];
  for (const dish of dishes) {
    result.push(await buildIngredientMatches(db, dish.ingredients));
  }
  return result;
}
