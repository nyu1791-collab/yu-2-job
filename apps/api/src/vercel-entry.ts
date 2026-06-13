/**
 * Vercel(Node.jsランタイム)向けのサーバーレス関数エントリポイント。
 *
 * `src/index.ts`(ローカル開発用: @hono/node-server の serve() + PGliteブートストラップ)とは異なり、
 * このファイルは Vercel 上で Hono アプリを 1リクエストずつ処理するだけ。
 * 本番(DATABASE_URL設定済み)を前提とし、マイグレーション/seedは実行しない。
 * 本番のマイグレーション+seedはVercelのビルド時(apps/api/vercel.json の buildCommand)に
 * `src/db/migrate-prod.ts` が自動実行する(詳細は同ファイルと apps/api/DEPLOY.md 参照)。
 *
 * デプロイ形態(重要):
 *   このファイルは build-vercel.sh が esbuild で依存込みの単一ESMにバンドルし、
 *   Vercel Build Output API(.vercel/output/functions/api/index.func/)として配信する。
 *   ゼロコンフィグの api/ ディレクトリ検出は使わない(生TSや .js→.ts 解決が
 *   素のNodeランタイムで壊れ、関数がロード時にクラッシュするのを避けるため)。
 *
 * ハンドラ:
 *   @hono/node-server/vercel の handle() は app.fetch を Node の
 *   (req: IncomingMessage, res: ServerResponse) ハンドラに変換する。これは
 *   Vercel の Node ランタイムが期待する古典的シグネチャで、確実に動作する。
 */
import { handle } from "@hono/node-server/vercel";
import { createApp } from "./app.js";

const app = createApp();

export default handle(app);
