/**
 * PGlite向けマイグレーションランナー(M2)。
 *
 * `drizzle/` 配下のSQLマイグレーション(drizzle-kit generate で生成)を
 * PGliteインスタンスに適用する。テストのセットアップから呼び出す想定。
 *
 * 本番(Neon Postgres / postgres-js)へのマイグレーションは
 * `pnpm --filter @pashacaro/api exec drizzle-kit migrate` 等を別途使用する
 * (DATABASE_URL を設定した上でCIやデプロイ手順から実行)。
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import type { Schema } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** リポジトリルートの drizzle/ ディレクトリへの絶対パス。 */
export const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../../drizzle");

/**
 * PGlite DBに `drizzle/` のマイグレーションをすべて適用する。
 */
export async function runMigrations(db: PgliteDatabase<Schema>): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
