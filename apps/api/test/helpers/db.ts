/**
 * テスト用DBセットアップヘルパー(M2)。
 *
 * createTestDb() で独立したPGliteインスタンスを作成し、
 * drizzle/ 配下のマイグレーションを適用、food_db/food_aliases + devユーザーを投入する。
 */

import { createTestDb, type Db } from "../../src/db/client.js";
import { runMigrations } from "../../src/db/migrate.js";
import { seedAll } from "../../src/db/seed.js";

/** マイグレーション適用 + seed投入済みのPGlite DBを返す。 */
export async function setupTestDb(): Promise<Db> {
  const db = await createTestDb();
  await runMigrations(db);
  await seedAll(db);
  return db;
}
