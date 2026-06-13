#!/usr/bin/env bash
#
# Vercel(Node.jsランタイム)向けにサーバーレス関数をバンドルする。
#
# なぜ必要か:
#   apps/api は内部import("../foo.js" 形式で実体は .ts)とワークスペースパッケージ
#   (@pashacaro/shared は exports が生の .ts)に依存しており、tsx等のTS対応ローダーが
#   無いと実行できない。Vercelの本番ランタイムは素のNodeで .ts を解決できないため、
#   デプロイされた関数が起動時に必ずクラッシュする(FUNCTION_INVOCATION_FAILED)。
#   そこで esbuild で api/index.ts を依存込みの単一JSにバンドルし、素のNodeで動く
#   api/index.js を生成して関数として配信する。
#
# pglite(@electric-sql/pglite)は本番では未使用(DATABASE_URL設定時はpostgres-jsを使う)で
# wasmを含むためバンドルから除外(external)し、動的importのまま残す。
set -euo pipefail
cd "$(dirname "$0")"

./node_modules/.bin/esbuild api/index.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node20 \
  --outfile=api/_func.mjs \
  --external:@electric-sql/pglite \
  --banner:js="import { createRequire as ___cr } from 'module'; import { fileURLToPath as ___f } from 'url'; import { dirname as ___d } from 'path'; const require = ___cr(import.meta.url); const __filename = ___f(import.meta.url); const __dirname = ___d(__filename);"

rm api/index.ts
mv api/_func.mjs api/index.js
echo "Bundled Vercel function -> apps/api/api/index.js"
