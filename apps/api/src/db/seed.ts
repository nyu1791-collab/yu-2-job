/**
 * テスト・ローカル開発用のシードデータ投入(M2)。
 *
 * scripts/seed-data/food-db-seed.ts のローカルfood_db/food_aliasesデータと、
 * dev用の固定ユーザー(POST /v1/meals 等で使う固定devユーザー)を投入する。
 *
 * 冪等: truncate -> 再投入。
 *
 * 注意: db.insert(table).returning(...) はPgliteDatabase / PostgresJsDatabase の
 * union型(Db)に対して呼び出すと型解決でエラーになるため、
 * ここでは sql テンプレート + RETURNING を使う(food-lookup.ts と同様の方針)。
 */

import { sql } from "drizzle-orm";
import { normalizeFoodName } from "@pashacaro/shared";
import { FOOD_ALIASES_SEED, FOOD_DB_SEED } from "@pashacaro/scripts/seed-data/food-db-seed";
import { dbRows, type Db } from "./client.js";

/** devユーザー(M2: 固定UUID。M3で認証導入後も同じIDを使い続けられるようにする)。 */
export const DEV_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * food_db / food_aliases へローカルseedデータを投入する(truncate -> insert、冪等)。
 */
export async function seedFoodDb(db: Db): Promise<{ foodCount: number; aliasCount: number }> {
  await db.execute(sql`TRUNCATE TABLE food_aliases, food_db RESTART IDENTITY CASCADE`);

  const foodNameToId = new Map<string, number>();

  for (const food of FOOD_DB_SEED) {
    const nameNormalized = normalizeFoodName(food.name);
    const inserted = await db.execute<{ id: number }>(sql`
      INSERT INTO food_db (food_code, name, name_normalized, group_code, kcal_100g, protein_100g, fat_100g, carbs_100g)
      VALUES (${food.foodCode}, ${food.name}, ${nameNormalized}, ${food.groupCode}, ${food.kcal100g}, ${food.protein100g}, ${food.fat100g}, ${food.carbs100g})
      RETURNING id
    `);
    const id = dbRows<{ id: number }>(inserted)[0]?.id;
    if (id !== undefined) {
      foodNameToId.set(food.name, Number(id));
    }
  }

  let aliasCount = 0;
  for (const alias of FOOD_ALIASES_SEED) {
    const foodDbId = foodNameToId.get(alias.foodName);
    if (foodDbId === undefined) {
      continue;
    }
    const normalizedAlias = normalizeFoodName(alias.alias);
    await db.execute(sql`
      INSERT INTO food_aliases (alias, food_db_id)
      VALUES (${normalizedAlias}, ${foodDbId})
    `);
    aliasCount += 1;
  }

  return { foodCount: FOOD_DB_SEED.length, aliasCount };
}

/**
 * devユーザー(固定UUID)をupsertする。
 * POST /v1/meals 等、M3の認証導入前は user_id にこの固定ユーザーを使う。
 */
export async function seedDevUser(db: Db): Promise<void> {
  await db.execute(sql`
    INSERT INTO users (id, display_name)
    VALUES (${DEV_USER_ID}, ${"Dev User"})
    ON CONFLICT (id) DO NOTHING
  `);
}

/** food_db/food_aliases + devユーザーを一括投入する(テストセットアップ用)。 */
export async function seedAll(db: Db): Promise<void> {
  await seedFoodDb(db);
  await seedDevUser(db);
}
