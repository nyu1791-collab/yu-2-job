-- Custom SQL migration file, put your code below! --

-- pg_trgm拡張を有効化し、food_db.name_normalized へGINトライグラムインデックスを追加する。
-- PLAN.md §4.2: ③ pg_trgm similarity上位1件(閾値0.45)による曖昧一致に使用。
--
-- PGlite(組み込みPostgres)・Neon Postgres双方で `CREATE EXTENSION pg_trgm` は利用可能。
-- PGlite側は @electric-sql/pglite/contrib/pg_trgm 拡張モジュールをdrizzleインスタンス生成時に
-- 読み込んでおく必要がある(apps/api/src/db/client.ts 参照)。
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "food_db_name_normalized_trgm_idx" ON "food_db" USING gin ("name_normalized" gin_trgm_ops);
