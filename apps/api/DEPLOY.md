# API(apps/api)をVercel + Neonにデプロイする手順

このAPIは Hono を `@hono/node-server/vercel` でラップした `apps/api/src/vercel-entry.ts` を
エントリポイントとし、`apps/api/build-vercel.sh` がビルド時にesbuildで単一の関数へバンドルして
Vercel Build Output API (`.vercel/output/`) を生成します。`/health` と `/v1/*` はその関数に
ルーティングされます(`apps/api/vercel.json` 参照)。

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
4. Framework Preset は **"Other"** を選択(`apps/api/vercel.json` のBuild Output APIでルーティングされる)

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

- `apps/api/src/vercel-entry.ts`(サーバーレス関数のエントリポイント)自体はマイグレーション/seedを
  実行しません。マイグレーション/seedはビルド時の `buildCommand`(`src/db/migrate-prod.ts`)が担当します。
- `apps/api/vercel.json` の `buildCommand` は、マイグレーション実行後に
  `apps/api/build-vercel.sh` を実行して `.vercel/output/` (Build Output API) を生成します。
  これがそのままデプロイされる関数本体になります。
- `INTERNAL_CRON_SECRET` を設定しない場合、`/v1/internal/cost-report` は500を返す(Cronが失敗する)。
- `DEV_TOKEN` は、モバイル側Vercelプロジェクトの環境変数 `EXPO_PUBLIC_DEV_TOKEN` と
  **完全に同じ値**である必要があります(後述「devトークンが一致しない場合」参照)。

## devトークンが一致しない場合(「トークンが無効です。」エラー)

モバイルアプリで「devトークンでスキップ」してサインインした後、AI解析などのAPI呼び出しで
`{"message":"トークンが無効です。"}` (401) が返る場合、この `apps/api` 側の `DEV_TOKEN` と
モバイル側Vercelプロジェクトの `EXPO_PUBLIC_DEV_TOKEN` の値が一致していません。

対処方法:

1. この `apps/api` プロジェクトの Vercel > Settings > Environment Variables で
   `DEV_TOKEN` の値を確認する(未設定なら適当な固定文字列を設定して再デプロイ)。
2. モバイル側プロジェクト(`apps/mobile`)の Vercel > Settings > Environment Variables で
   `EXPO_PUBLIC_DEV_TOKEN` を、手順1と**全く同じ値**に設定する。
3. `EXPO_PUBLIC_*` はビルド時に静的に埋め込まれるため、値を変更・新規設定した後は
   モバイル側プロジェクトを**再デプロイ(Redeploy)**する必要がある
   (Deployments タブ > 最新デプロイの「…」メニュー > Redeploy)。
4. 再デプロイ完了後、モバイルアプリでいったんサインアウト/サインインし直し
   (「devトークンでスキップ」を再度実行)、新しいトークンを取得する。
