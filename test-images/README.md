# test-images/ — 解析精度評価用データセット(M6 / PLAN.md §5)

`scripts/eval.ts` が読み込む評価用画像セットと正解データを置くディレクトリです。
**このディレクトリは現在空です**(この開発・CI環境には実際の食事写真がありません)。
実画像と `ANTHROPIC_API_KEY` が用意できる環境で、以下の構成に従って準備し、
`pnpm --filter @pashacaro/scripts eval` を実行してください。

## 画像セット(30枚, PLAN.md §5)

| カテゴリ | 枚数 |
| --- | --- |
| 和食定食(主菜・副菜・汁物・米飯など) | 6 |
| 丼・カレー | 4 |
| 麺類 | 4 |
| コンビニ弁当・商品 | 6 |
| 洋食 | 4 |
| 複数皿 | 3 |
| 低照度/斜めなど条件が悪い写真 | 3 |
| **合計** | **30** |

画像ファイルはこのディレクトリ直下に置きます(例: `001_teishoku.jpg`,
`002_curry.jpg`, ...)。対応するファイル名を `expected.csv` の `filename` 列に
記載してください。

## expected.csv の形式

ヘッダー行 + データ行。列は以下の順序・名称で固定します。

```csv
filename,dish_name,kcal,protein_g,fat_g,carbs_g
001_teishoku.jpg,鯖の塩焼き定食,650,38,22,75
002_curry.jpg,チキンカレー,820,28,30,105
```

- `filename`: このディレクトリ内の画像ファイル名
- `dish_name`: 料理名の正解(人手)。複数皿の場合は `/` 区切りなどで
  目視比較できる形式にする(例: `焼き鮭 / 味噌汁 / ご飯 / ほうれん草の胡麻和え`)
- `kcal` / `protein_g` / `fat_g` / `carbs_g`: 1食(写真全体)の総量の正解値。
  コンビニ弁当・商品は**パッケージの栄養成分表示の実値**を使用する

## 実行方法

```bash
ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @pashacaro/scripts eval
```

- `test-images/` または `test-images/expected.csv` が無い場合、スクリプトは
  明確なエラーメッセージを出して終了します(`exitCode = 1`)。
- 成功すると `test-images/results-{YYYY-MM-DD}.csv`(Asia/Tokyo日付)が出力されます。

## results-{date}.csv の列

`filename, expected_dish_name, actual_dish_name, expected_kcal, actual_kcal,
kcal_error_pct, expected_protein_g, actual_protein_g, protein_error_pct,
expected_fat_g, actual_fat_g, fat_error_pct, expected_carbs_g, actual_carbs_g,
carbs_error_pct, confidence, final_model, escalated, input_tokens,
output_tokens, cache_read_input_tokens, cache_creation_input_tokens, cost_usd`

- `actual_dish_name` と `expected_dish_name` を並べて目視で料理特定の正誤を採点する
- `confidence` は解析結果の dishes の confidence の単純平均
- `cost_usd` は `computeAnalysisCostUsd`(`packages/shared/src/cost.ts`)による
  1リクエストあたりの推定コスト

標準出力にも kcal/protein 誤差%の中央値・合計コストのサマリーが表示されます。

## 採点基準(PLAN.md §5)

- 料理特定率 80% 以上(`actual_dish_name` / `expected_dish_name` の目視比較)
- kcal 誤差中央値 ±20% 以内
- protein_g 誤差中央値 ±25% 以内
- プロンプト・閾値(escalation条件等)を変更するたびに再実行し、回帰が無いか確認する

## このリポジトリでの現状

この環境には `ANTHROPIC_API_KEY` も実際の食事写真もないため、本スクリプトは
**今は実行していません**。コード(`scripts/eval.ts`)とこのドキュメントのみを
用意し、実画像・APIキーが揃う環境で実行・チューニングしてください。
