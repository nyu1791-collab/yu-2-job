# API(apps/api)をVercel + Neonにデプロイする手順

このAPIは Hono を `hono/vercel` でラップした `apps/api/api/index.ts` をエントリポイントとし、
`apps/api/vercel.json` の `rewrites` で `/health` と `/v1/*` をその関数に転送します。

## 1. Neon(無料枠)でPostgresを用意する

1. https://neon.tech でアカウント作成 → 新規プロジェクト作成(リージョンは Tokyo がおすすめ)
2. 発行された接続文字列(`postgres://...`)をメモする → これが `DATABASE_URL`

## 2. マイグレーションを適用する

ローカルから一度だけ、Neonに対してマイグレーションを実行します(`apps/api`ディレクトリで):

```bash
DATABASE_URL="<neonの接続文字列>" pnpm --filter @pashacaro/api exec drizzle-kit migrate
```

必要に応じて `pnpm --filter @pashacaro/api exec tsx scripts もしくは src/db/seed.ts相当` で
初期データ(食材DB等)を投入する(seedスクリプトの詳細はリポジトリルートのREADME参照)。

## 3. Vercelにプロジェクトを作成する

1. https://vercel.com にGitHubアカウントでログイン
2. 「Add New > Project」で `nyu1791-collab/yu-2-job` を選択
3. 「Root Directory」を `apps/api` に変更(Edit リンクから設定)
4. Framework Preset は "Other" のままでOK(`apps/api/vercel.json` のrewritesでルーティングされる)

## 4. 環境変数を設定する

`apps/api/.env.example` に記載の各キーを、Vercel の Project Settings > Environment Variables に設定する。
特に以下は本番運用に必須:

| Key | 値 |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic Consoleで発行したAPIキー |
| `DEV_TOKEN` | 任意の固定文字列(モバイルアプリの「devトークンでスキップ」用) |
| `JWT_SECRET` | ランダムな長い文字列 |
| `DATABASE_URL` | 手順1のNeon接続文字列 |
| `INTERNAL_CRON_SECRET` | ランダムな文字列。VercelのCron用 `CRON_SECRET` にも同じ値を設定 |

`PORT` と `PGLITE_FORCE` はVercelでは不要(ローカル開発専用)。

## 5. デプロイ

上記設定後、Vercelが自動デプロイする。完了すると `https://<project>.vercel.app` が発行される。

```bash
curl https://<project>.vercel.app/health
# => {"status":"ok"}
```

このURLを、モバイルアプリ(Webデモ)の `EXPO_PUBLIC_API_URL` に設定する
(詳細はリポジトリルートの README「Webデモ版をVercelで試す」セクション参照)。

## 注意

- `apps/api/api/index.ts` は本番(`DATABASE_URL`設定済み)を前提とし、PGliteのマイグレーション/seedは実行しない
- `INTERNAL_CRON_SECRET` を設定しない場合、`/v1/internal/cost-report` は500を返す(Cronが失敗する)
