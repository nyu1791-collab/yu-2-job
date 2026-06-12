/**
 * DB接続ファクトリ(PLAN.md §4.2/§4.3 — M2)。
 *
 * - 本番: `DATABASE_URL` が設定されている場合、postgres-js (Neon Postgres想定) で接続する。
 * - ローカル開発・テスト: `DATABASE_URL` が未設定の場合(またはテスト環境)、
 *   `@electric-sql/pglite`(組み込みPostgres)+ `drizzle-orm/pglite` を使用する。
 *
 * PGliteは pg_trgm 拡張をサポートしているため、インスタンス生成時に
 * `@electric-sql/pglite/contrib/pg_trgm` を読み込み、マイグレーションで
 * `CREATE EXTENSION pg_trgm` を有効化する(drizzle/0001_pg_trgm.sql)。
 *
 * 接続が無い(DATABASE_URLなし・非テスト環境)場合は `getDb()` が null を返し、
 * 呼び出し側(/v1/analyze等)は補正・ログ記録をスキップして従来動作にフォールバックする。
 */

import { drizzle as drizzlePglite, type PgliteDatabase } from "drizzle-orm/pglite";
import { drizzle as drizzlePostgresJs, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema.js";

export type Schema = typeof schema;
export type Db = PgliteDatabase<Schema> | PostgresJsDatabase<Schema>;

let cachedDb: Db | null = null;

/**
 * テスト用に明示的に作成したPGlite DBを設定する。
 * 以後 `getDb()` はこのインスタンスを返す。
 */
export function _setDbForTest(db: Db | null): void {
  cachedDb = db;
}

/** テスト用: キャッシュをリセットする。 */
export function _resetDbForTest(): void {
  cachedDb = null;
}

/**
 * DB接続を取得する。
 *
 * - `DATABASE_URL` が設定されている場合: postgres-js で接続(Neon Postgres想定)。
 * - 未設定の場合: インメモリPGliteを生成(プロセス内で1つのインスタンスを再利用)。
 *
 * 戻り値は常に non-null。「DBが無い」場合のフォールバック判定は
 * `isDbConfigured()` を使用すること(DATABASE_URL未設定かつ非テスト環境)。
 */
export async function getDb(): Promise<Db> {
  if (cachedDb) {
    return cachedDb;
  }

  const databaseUrl = process.env["DATABASE_URL"];
  if (databaseUrl) {
    const postgres = (await import("postgres")).default;
    const client = postgres(databaseUrl, { max: 1 });
    cachedDb = drizzlePostgresJs(client, { schema });
    return cachedDb;
  }

  cachedDb = await createPgliteDb();
  return cachedDb;
}

/**
 * `DATABASE_URL` が設定されているか(本番/Neon接続が期待される状態か)を返す。
 *
 * `/v1/analyze` 等は、本番でDB未設定の場合に補正・ログ記録をスキップして
 * M1の従来動作にフォールバックするためにこれを使う。
 * テスト環境(`PGLITE_FORCE=1` または `NODE_ENV=test`)では、DATABASE_URLが無くても
 * PGliteを使ってDB機能を有効化する。
 */
export function isDbConfigured(): boolean {
  if (process.env["DATABASE_URL"]) {
    return true;
  }
  return isTestEnv();
}

function isTestEnv(): boolean {
  return process.env["NODE_ENV"] === "test" || process.env["PGLITE_FORCE"] === "1";
}

/**
 * @electric-sql/pglite/contrib/pg_trgm を読み込んだPGliteインスタンスを生成し、
 * drizzleでラップする。インメモリ(永続化なし)。
 */
async function createPgliteDb(): Promise<PgliteDatabase<Schema>> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { pg_trgm } = await import("@electric-sql/pglite/contrib/pg_trgm");

  const client = await PGlite.create({
    extensions: { pg_trgm },
  });

  return drizzlePglite(client, { schema });
}

/**
 * テスト専用: 新しい独立したPGlite DBインスタンスを作成する。
 * テストごとに独立したDB状態が必要な場合に使用する
 * (このモジュールのキャッシュは更新しない)。
 */
export async function createTestDb(): Promise<PgliteDatabase<Schema>> {
  return createPgliteDb();
}

/**
 * `db.execute(sql\`...\`)` の戻り値をドライバ間で統一して配列として取り出す。
 *
 * - drizzle-orm/pglite: `{ rows: T[], ... }` (PGliteの `Results` 型)
 * - drizzle-orm/postgres-js: `RowList<T[]>`(配列そのもの)
 *
 * 両方を吸収し、常に `T[]` を返す。
 */
export function dbRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) {
    return result as T[];
  }
  const withRows = result as { rows?: T[] };
  return withRows.rows ?? [];
}

export { schema };
