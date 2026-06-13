import { serve } from "@hono/node-server";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { createApp } from "./app.js";
import { getDb, isDbConfigured, type Schema } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { seedAll } from "./db/seed.js";

const app = createApp();

const port = Number(process.env["PORT"] ?? 8787);

/**
 * ローカル開発(DATABASE_URL未設定 = PGlite)の場合のみ、起動時にマイグレーション+seedを実行する。
 * 本番(Neon Postgres)はCI/デプロイ手順で別途マイグレーションする(migrate.tsのコメント参照)。
 */
async function bootstrapPgliteIfNeeded(): Promise<void> {
  if (process.env["DATABASE_URL"] || !isDbConfigured()) {
    return;
  }
  const db = (await getDb()) as PgliteDatabase<Schema>;
  await runMigrations(db);
  await seedAll(db);
  console.log("[dev] PGlite: migrations + seed (food_db/食材別名/devユーザー) を適用しました。");
}

await bootstrapPgliteIfNeeded();

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`pashacaro API listening on http://localhost:${info.port}`);
  if (!process.env["ANTHROPIC_API_KEY"]) {
    console.warn(
      "[warn] ANTHROPIC_API_KEY is not set. /v1/analyze and /v1/analyze/text will return 500 until it is configured.",
    );
  }
  if (!process.env["DEV_TOKEN"]) {
    console.warn(
      "[warn] DEV_TOKEN is not set. /v1/analyze and /v1/analyze/text will return 500 for all requests.",
    );
  }
  if (!process.env["JWT_SECRET"]) {
    console.warn(
      "[warn] JWT_SECRET is not set. /v1/auth/* and JWT-authenticated routes will return 500 (unless DEV_TOKEN covers all requests).",
    );
  }
});
