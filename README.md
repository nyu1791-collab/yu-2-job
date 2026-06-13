# パシャカロ(Pashacaro)

写真AIで食事を記録するカロリー・PFC(タンパク質/脂質/炭水化物)管理アプリの
モノレポです。詳細な事業計画・データモデル・API設計は [`PLAN.md`](./PLAN.md)
を参照してください。

- 写真を撮るだけでAI(Claude)が料理を認識し、kcal・P/F/Cを推定します。
- 和食・定食・コンビニ商品の認識精度と、PFC(特にタンパク質)を重視したUIが特徴です。
- 1日の残りカロリー・PFCをリングとバーで可視化し、記録の手間を最小化します。

## モノレポ構成

```
apps/
  api/       Hono製のバックエンドAPI(Drizzle ORM + PGlite/Neon Postgres)
  mobile/    Expo Router製のモバイルアプリ(React Native)
packages/
  shared/    APIとモバイルで共有する純関数・スキーマ(Vitestで検証)
scripts/     運用・評価用スクリプト(eval.ts, check-cache.ts, ingest-mext.ts等)
test-images/ 解析精度評価用の画像セット(現在は空。test-images/README.md参照)
drizzle/     DBマイグレーション(apps/api/src/db)
vercel.json  Vercel Cron設定(日次コストレポート)
PLAN.md      事業計画・データモデル・API設計・マイルストーン(M1〜M6)
```

## セットアップ

### 必要要件

- Node.js >= 20
- pnpm 10.34.3(`packageManager` で固定。`corepack enable` 推奨)

### インストール

```bash
pnpm install
```

### 環境変数

#### `apps/api`(バックエンド)

| 変数名 | 必須/任意 | 説明 |
| --- | --- | --- |
| `DATABASE_URL` | 任意 | Postgres接続文字列(Neon想定)。未設定時はPGlite(インメモリ/組み込みPostgres)で動作する。 |
| `JWT_SECRET` | 必須(認証利用時) | アクセス/リフレッシュJWTの署名鍵(HS256)。 |
| `DEV_TOKEN` | 開発用 | 固定devトークン。`Authorization: Bearer <DEV_TOKEN>` で devユーザー(`DEV_USER_ID`)として認証をスキップできる。 |
| `APPLE_CLIENT_ID` | Apple Sign In利用時 | Apple IDトークン検証時の `audience`。 |
| `GOOGLE_CLIENT_ID` | Googleサインイン利用時 | Google IDトークン検証時の `audience`。 |
| `ANTHROPIC_API_KEY` | 解析API利用時 | Claude(`claude-haiku-4-5` / `claude-sonnet-4-6`)呼び出し用APIキー。未設定でもサーバは起動するが `/v1/analyze` は `config_error`(500)になる。 |
| `REVENUECAT_WEBHOOK_SECRET` | Webhook利用時 | `POST /v1/webhooks/revenuecat` の共有シークレット(`Authorization: Bearer <secret>`)。 |
| `INTERNAL_CRON_SECRET` | コストレポート利用時 | `GET /v1/internal/cost-report` の共有シークレット。Vercel Cron経由で叩く場合、Vercelの `CRON_SECRET` にも同じ値を設定する。 |
| `PGLITE_FORCE` | テスト用 | `1` を指定すると `DATABASE_URL` 未設定でもPGlite経由でDB機能を有効化する(`NODE_ENV=test` でも同様)。 |
| `PORT` | 任意 | APIサーバのリスンポート(デフォルト `8787`)。 |

#### `apps/mobile`(モバイル, `.env` または EAS環境変数)

| 変数名 | 必須/任意 | 説明 |
| --- | --- | --- |
| `EXPO_PUBLIC_API_URL` | 必須 | バックエンドAPIのベースURL(例: `http://localhost:8787`)。 |
| `EXPO_PUBLIC_DEV_TOKEN` | 開発用 | `apps/api` の `DEV_TOKEN` と同じ値。サインイン画面の「devトークンでスキップ」ボタンから使用。 |
| `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` / `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | Googleサインイン利用時 | Google OAuthクライアントID(プラットフォーム別)。 |
| `EXPO_PUBLIC_RC_API_KEY` / `EXPO_PUBLIC_RC_API_KEY_IOS` / `EXPO_PUBLIC_RC_API_KEY_ANDROID` | 課金機能利用時 | RevenueCatのPublic SDK Key。プラットフォーム別キーがあれば `_IOS`/`_ANDROID` を優先。 |

## テスト・型チェック

```bash
pnpm -r test        # 全パッケージのVitest(apps/api はPGlite統合テスト含む)
pnpm -r typecheck   # 全パッケージのtsc --noEmit
```

`apps/mobile` には現時点で独自のユニットテストは無く(`packages/shared` に
集約)、`pnpm --filter @pashacaro/mobile test` はno-opで成功します。

## ローカル開発

```bash
# APIサーバ(PGlite, マイグレーション+seedを自動実行)
pnpm dev   # = pnpm --filter @pashacaro/api dev

# モバイル(別ターミナル)
pnpm --filter @pashacaro/mobile start
```

## マイルストーン別 手動確認手順(M1〜M6)

各マイルストーンの実装後に、以下を目安に手動確認します(詳細はPLAN.md §5)。

- **M1 — 基盤・写真解析の最小動線**: `/health` が200。写真または手入力で
  `/v1/analyze` を呼び、kcal/P/F/Cが返ることを確認。
- **M2 — 成分表突合・分量補正**: 同じ料理名で複数回解析し、`food_db` との
  突合により栄養値が補正される(`corrected: true`)ことを確認。
- **M3 — 認証+目標設定オンボーディング**: Apple/Googleサインイン(または
  devトークン)後、goalウィザード3画面でPFC目標が計算され、再ログイン後も
  目標が復元されることを確認(`pnpm --filter @pashacaro/shared test` で
  goal-calcのVitestが全て通ること)。
- **M4 — ホーム・履歴・編集・手動入力**: 3食記録後、ホームのリング残量が
  手計算(目標−合計)と一致すること。分量スライダーを1.5倍にすると
  kcal/PFCが1.5倍になることを確認。週次画面で達成率が表示されること。
- **M5 — RevenueCat課金+保護**: Sandboxアカウントで購入 →
  `subscriptions` テーブルが `trial`→`active` に遷移し `/v1/analyze` が
  通過することを確認。未購入アカウントは `/v1/analyze` が403
  (`subscription_required`)。trialは6枚目の解析リクエストで429
  (`rate_limited`, `remaining: 0`)になることを確認。
- **M6 — 通知・精度評価・コスト監視・リリース準備**:
  - ローカル通知: 設定画面の「食事記録のリマインダー」をONにし、通知権限を
    許可。当日未記録の状態でアプリを起動/フォアグラウンド復帰すると
    12:30/19:30(Asia/Tokyo, 過去なら翌日扱い)にリマインダーが
    スケジュールされることを確認(`packages/shared` の
    `notification-schedule` Vitestで時刻計算ロジックを検証済み)。
  - 精度評価: `test-images/` に画像と `expected.csv` を用意し
    `ANTHROPIC_API_KEY=... pnpm --filter @pashacaro/scripts eval` を実行。
    `results-{date}.csv` が出力され、kcal/PFC誤差%・confidence・コストが
    確認できること(本リポジトリではAPIキー・実画像が無いため未実行)。
  - コスト監視: `INTERNAL_CRON_SECRET` を設定した状態で
    `GET /v1/internal/cost-report?date=YYYY-MM-DD` を呼び、
    `totalCostUsd` / `escalationRate` / `statusCounts` / `topUsers` が
    返ること、誤シークレットで401になることを確認(PGlite統合テスト
    `apps/api/test/internal.test.ts` で検証済み)。
  - EAS Build: 下記参照。

## EAS Build / TestFlight・内部テスト配布

`apps/mobile/eas.json` に `development` / `preview` / `production` の3プロファイルを
用意しています。

```bash
cd apps/mobile

# 開発クライアント(development buildのAPK/シミュレータ向け)
npx eas build --profile development --platform all

# 内部配布(社内テスト用、APK/internal distribution)
npx eas build --profile preview --platform all

# ストア提出用(App Bundle / TestFlight・本番)
npx eas build --profile production --platform all

# TestFlight / Google Play への提出
npx eas submit --profile production --platform ios
npx eas submit --profile production --platform android
```

- iOS bundle identifier / Android package はいずれも `com.pashacaro.app`
  (`apps/mobile/app.json`)。
- `runtimeVersion` は `policy: "appVersion"`(EAS Update運用時、appの
  `version` と紐づく)。
- 各プロファイルの `env.EXPO_PUBLIC_API_URL` はプレースホルダーです。実際の
  デプロイ先URLに差し替えてください。
- EAS課金関連のシークレット(`EXPO_PUBLIC_RC_API_KEY*` 等)はEASの
  環境変数(`eas secret` / `eas env`)で設定することを推奨します。

## 日次コストレポート(Vercel Cron)

`vercel.json` に `GET /v1/internal/cost-report` を毎日 03:00 Asia/Tokyo
(= 18:00 UTC 前日)に呼び出すCron設定があります。デプロイ時は以下を設定してください。

- `INTERNAL_CRON_SECRET`(API側で検証する共有シークレット)
- `CRON_SECRET`(Vercel Cronが自動付与する `Authorization: Bearer` の値。
  上記と同じ値にする)

日次の総コストが $20 を超えると、レスポンスの `alert` が `true` になります
(現時点では通知連携は未実装。フラグのみ — `apps/api/src/routes/internal.ts` の
TODOコメント参照)。

## 既知の制限(この開発環境について)

このリポジトリの開発・CI環境には以下が**ありません**:

- `ANTHROPIC_API_KEY`(実際のAI解析API呼び出しは未実施)
- 実機(iOS/Android実機・シミュレータでの動作確認は未実施)
- Neon(本番Postgres)への接続(DB関連の検証はすべてPGliteの統合テストで実施)
- `test-images/` の実画像(`scripts/eval.ts` による精度評価は未実行)

そのため、検証は以下に限定されています:

- `pnpm -r test`(Vitest、PGlite統合テスト含む)
- `pnpm -r typecheck`
- ローカルPGliteサーバへのcurlによる手動確認

実APIキー・実機・Neon・実画像が揃った環境で、上記「既知の制限」に該当する
項目を追加で検証してください。
