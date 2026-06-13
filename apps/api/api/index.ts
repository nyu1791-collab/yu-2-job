/**
 * Vercel(Node.jsランタイム)向けのサーバーレスエントリポイント。
 *
 * `src/index.ts`(ローカル開発用: @hono/node-server + PGliteブートストラップ)とは異なり、
 * このファイルはVercel上でHonoアプリをFetch標準の Request/Response でハンドルするのみ。
 * 本番(DATABASE_URL設定済み)を前提とし、PGliteのマイグレーション/seedは実行しない
 * (本番マイグレーションは `pnpm --filter @pashacaro/api exec drizzle-kit migrate` を
 * デプロイ手順で別途実行する。詳細は src/db/migrate.ts のコメント参照)。
 *
 * ルーティングは apps/api/vercel.json の rewrites で /v1/* と /health をこの関数に転送する。
 */
import { handle } from "hono/vercel";
import { createApp } from "../src/app.js";

const app = createApp();

export default handle(app);
