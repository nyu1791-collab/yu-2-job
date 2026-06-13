/**
 * 本番(Neon Postgres / postgres-js)向けのマイグレーション + seed ランナー。
 *
 * Vercelのビルド時(apps/api/vercel.json の buildCommand)から `tsx` で実行する。
 * これにより、ローカルターミナルから手動で `drizzle-kit migrate` を実行しなくても、
 * デプロイのたびに自動でマイグレーション(`drizzle/` 配下のSQL)と
 * 参照データのseed(`seedAll`)が適用される。
 *
 * 挙動:
 * - `DATABASE_URL` 未設定: 警告を出して exit 0(プレビュー/DB無しビルドを失敗させない)。
 * - 設定済み: postgres-js で接続 → migrate → seedAll → 接続クローズ。
 *   いずれかで失敗した場合は exit 1(ビルドを明示的に失敗させ、DB問題を早期に表面化)。
 *
 * `seedAll` は参照テーブル(food_db / food_aliases)のtruncate+再投入と
 * devユーザーのupsert(ON CONFLICT DO NOTHING)のみを行い、users/meals/analysis_logs等の
 * ユーザー生成データには触れないため、毎デプロイで安全に実行できる。
 */

import { fileURLToPath } from "node:url";
import path from "node:path";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { schema, type Db, type Schema } from "./client.js";
import { seedAll } from "./seed.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** リポジトリルートの drizzle/ ディレクトリへの絶対パス(migrate.ts と同じ解決方法)。 */
const MIGRATIONS_FOLDER = path.resolve(__dirname, "../../../../drizzle");

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];

  if (!databaseUrl) {
    process.stderr.write(
      "[migrate-prod] DATABASE_URL未設定のためスキップします(プレビュー/DB無しビルド)\n",
    );
    process.exit(0);
  }

  const client = postgres(databaseUrl, { max: 1 });
  const db: PostgresJsDatabase<Schema> = drizzle(client, { schema });

  try {
    process.stdout.write(`[migrate-prod] マイグレーション適用中: ${MIGRATIONS_FOLDER}\n`);
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

    process.stdout.write("[migrate-prod] seed投入中(食材DB + devユーザー)\n");
    await seedAll(db as Db);

    process.stdout.write("[migrate-prod] マイグレーション + seed 完了\n");
  } catch (error) {
    process.stderr.write(`[migrate-prod] 失敗しました: ${String(error)}\n`);
    if (error instanceof Error && error.stack) {
      process.stderr.write(`${error.stack}\n`);
    }
    await client.end({ timeout: 5 }).catch(() => undefined);
    process.exit(1);
  }

  await client.end();
}

void main();
