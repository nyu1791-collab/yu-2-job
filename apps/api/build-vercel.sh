#!/usr/bin/env bash
#
# Vercel Build Output API (v3) を生成するビルドスクリプト。
#
# なぜこの方式か:
#   apps/api は内部importが拡張子.js表記(実体は.ts)で、ワークスペース
#   @pashacaro/shared も exports が生の .ts。これらは tsx 等のTS対応ローダーが
#   無いと実行できず、Vercelのゼロコンフィグ(api/ディレクトリ自動検出)で
#   デプロイすると素のNodeランタイムが .ts を解決できず関数が起動時にクラッシュする
#   (FUNCTION_INVOCATION_FAILED)。また vercel.json の functions パターンは
#   「コミット済みソースのapi/」に対して検証されるため、ビルドで生成したファイルを
#   指定すると "pattern doesn't match" でビルドが落ちる。
#
#   そこで Build Output API を使う。esbuild で src/vercel-entry.ts を依存込みの
#   単一ESMにバンドルし、.vercel/output/ 配下に関数・ルーティング・静的ファイルを
#   自前で配置する。Vercelは .vercel/output/ をそのまま配信するため、ソース検出や
#   パターン検証・ビルド順序に左右されず確実に動く。
#
# pglite(@electric-sql/pglite / drizzle-orm/pglite)は開発・テスト専用で本番未使用。
# wasmを含みバンドルできないため external にし、動的importのまま残す
# (本番では DATABASE_URL 設定により postgres-js 経路のみ実行され、pgliteは呼ばれない)。
set -euo pipefail
cd "$(dirname "$0")"

OUT=".vercel/output"
FUNC="$OUT/functions/api/index.func"

rm -rf "$OUT"
mkdir -p "$FUNC" "$OUT/static"

# 1) 関数本体を単一ESMにバンドル
./node_modules/.bin/esbuild src/vercel-entry.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node20 \
  --outfile="$FUNC/index.mjs" \
  --external:@electric-sql/pglite \
  --external:@electric-sql/pglite/contrib/pg_trgm \
  --external:drizzle-orm/pglite \
  --banner:js="import { createRequire as ___cr } from 'module'; import { fileURLToPath as ___f } from 'url'; import { dirname as ___d } from 'path'; const require = ___cr(import.meta.url); const __filename = ___f(import.meta.url); const __dirname = ___d(__filename);"

# 2) 関数の設定(Nodeランタイム / ハンドラ / ESM)
cat > "$FUNC/.vc-config.json" <<'JSON'
{
  "runtime": "nodejs20.x",
  "handler": "index.mjs",
  "launcherType": "Nodejs",
  "shouldAddHelpers": false,
  "maxDuration": 60
}
JSON

# 3) .mjs を ESM 扱いにする(関数ディレクトリ内)
cat > "$FUNC/package.json" <<'JSON'
{ "type": "module" }
JSON

# 4) ルーティング + Cron(Build Output API config)
cat > "$OUT/config.json" <<'JSON'
{
  "version": 3,
  "routes": [
    { "src": "^/health$", "dest": "/api/index" },
    { "src": "^/v1/(.*)$", "dest": "/api/index" },
    { "handle": "filesystem" }
  ],
  "crons": [
    { "path": "/v1/internal/cost-report", "schedule": "0 18 * * *" }
  ]
}
JSON

# 5) 静的ファイル(ランディングページ)
if [ -d public ]; then
  cp -R public/. "$OUT/static/"
fi

echo "Build Output API generated at apps/api/$OUT"
