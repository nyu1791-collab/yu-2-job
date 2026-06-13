# API(apps/api)をVercel + Neonにデプロイする手順

このAPIは Hono を `hono/vercel` でラップした `apps/api/api/index.ts` をエントリポイントとし、
`apps/api/vercel.json` の `rewrites` で `/health` と `/v1/*` をその関数に転送します。

**この手順はすべてスマホ(ブラウザ)から完結します。ローカルターミナルは不要です。**
マイグレーションと初期データ(seed)はVercelのビルド中に自動で適用されます(下記「2. マイグレーションは自動」参照)。

## 1. Neon(無料枠)でPostgresを用意する

1. https://neon.tech でアカウント作成 → 新規プロジェクト作成(リージョンは Tokyo がおすすめ)
2. 発行された接続文字列(`postgres://...`)をメモする → これが `DATABASE_URL`

## 2. マイグレーションは自動(手動実行は不要)

以前は手元のターミナルから `drizzle-kit migrate` を実行する必要がありましたが、**現在は不要です。**

`apps/api/vercel.json` の `buildCommand` が、デプロイのたびに自動で
`src/db/migrate-prod.ts` を実行します。このスクリプトは:

- `drizzle/` 配下のSQLマイグレーションをNeonに適用する
- 参照データ(食材DB `food_db`/`food_aliases`)を再投入し、devユーザーをupsertする(`seedAll`)

挙動の要点:

- `seedAll` は参照テーブルの再投入と devユーザーのupsert(`ON CONFLICT DO NOTHING`)のみを行い、
  `users`/`meals`/`analysis_logs` などのユーザー生成データには触れません。
  そのため**毎デプロイで安全に実行**できます(既存の利用者データは消えません)。
- **`DATABASE_URL` が設定されていて接続できない/無効な場合、ビルドは失敗します**(意図的な挙動 — DB問題を早期に検知するため)。
- `DATABASE_URL` が未設定の場合、マイグレーションはスキップされ、ビルドは成功します(プレビュー等)。

つまり、利用者がやることは「手順1でNeonを作る」「手順3-4でVercelに環境変数を設定する」「Deploy」だけです。

## 3. Vercelにプロジェクトを作成する

1. https://vercel.com にGitHubアカウントでログイン
2. 「Add New > Project」で `nyu1791-collab/yu-2-job` を選択
3. 「Root Directory」を `apps/api` に変更(Edit リンクから設定)
4. Framework Preset は **"Other"** を選択(`apps/api/vercel.json` のrewritesでルーティングされる)

## 4. 環境変数を設定する

Vercel の Project Settings > Environment Variables に設定します。
`apps/api/.env.example` も参照してください。

### 必須(これが揃わないとAPIは動きません)

| Key | 値 | 用途 |
|---|---|---|
| `DATABASE_URL` | 手順1のNeon接続文字列 | DB接続。未設定だとマイグレーションはスキップされDB機能が無効になる |
| `ANTHROPIC_API_KEY` | Anthropic Consoleで発行したAPIキー | AI解析(`/v1/analyze`) |
| `DEV_TOKEN` | 任意の固定文字列 | モバイルアプリの「devトークンでスキップ」サインイン用 |
| `JWT_SECRET` | ランダムな長い文字列 | 発行するアクセストークンの署名 |

### 任意(機能を使う場合のみ)

| Key | 値 | 用途 |
|---|---|---|
| `APPLE_CLIENT_ID` | Apple Sign In のクライアントID | Appleサインインを使う場合 |
| `GOOGLE_CLIENT_ID` | Google OAuth のクライアントID | Googleサインインを使う場合 |
| `REVENUECAT_WEBHOOK_SECRET` | RevenueCat Webhookの検証シークレット | 課金(RevenueCat)連携を使う場合 |
| `INTERNAL_CRON_SECRET` | ランダムな文字列。VercelのCron用 `CRON_SECRET` にも同じ値を設定 | `/v1/internal/cost-report` のCron用。未設定だとCronは500になる |

`PORT` と `PGLITE_FORCE` はVercelでは不要(ローカル開発専用)。

## 5. デプロイ

上記設定後、「Deploy」を押す(または以後はpushで自動デプロイ)。
ビルド中に自動でマイグレーション+seedが走り、完了すると `https://<project>.vercel.app` が発行されます。

## 6. デプロイ後の確認

```bash
curl https://<project>.vercel.app/health
# => {"status":"ok"}
```

`{"status":"ok"}` が返ればAPIは稼働しています。
このURLを、モバイルアプリ(Webデモ)の `EXPO_PUBLIC_API_URL` に設定します
(詳細はリポジトリルートの README「Webデモ版をVercelで試す」セクション参照)。

## 注意

- `apps/api/api/index.ts`(サーバーレス関数)自体はマイグレーション/seedを実行しません。
  マイグレーション/seedはビルド時の `buildCommand`(`src/db/migrate-prod.ts`)が担当します。
- カスタム `buildCommand` を設定しても、Vercelは `api/` 配下のNode関数(`api/index.ts`)を
  ゼロコンフィグで自動的に検出・バンドルします(`buildCommand` はマイグレーション実行のためだけに使われます)。
- `INTERNAL_CRON_SECRET` を設定しない場合、`/v1/internal/cost-report` は500を返す(Cronが失敗する)。
