/**
 * scripts/eval.ts
 *
 * 解析精度の評価スクリプト(M6 / PLAN.md §5)。
 *
 * `test-images/` に置いた評価用画像セット(30枚)を AI解析パイプライン
 * (Haiku→Sonnetエスカレーションを含む。apps/api/src/lib/analyze.ts と同等のロジック)に
 * 通し、`test-images/expected.csv` の人手正解と比較して
 * `results-{date}.csv` を出力する。
 *
 * ## test-images/ の構成(PLAN.md §5、30枚)
 *   - 和食定食 × 6
 *   - 丼・カレー × 4
 *   - 麺類 × 4
 *   - コンビニ弁当・商品 × 6
 *   - 洋食 × 4
 *   - 複数皿 × 3
 *   - 低照度/斜め × 3
 *
 * ## test-images/expected.csv の形式
 *   ヘッダー: filename,dish_name,kcal,protein_g,fat_g,carbs_g
 *   - filename: test-images/ 内の画像ファイル名(例: 001_teishoku.jpg)
 *   - dish_name: 料理名の正解(人手採点用。複数皿の場合は "/" 区切り等、目視で比較できれば良い)
 *   - kcal/protein_g/fat_g/carbs_g: 総量の正解値
 *     (コンビニ商品はパッケージの栄養成分表示の実値を使用)
 *
 * ## 出力 results-{date}.csv の列
 *   filename, expected_dish_name, actual_dish_name,
 *   expected_kcal, actual_kcal, kcal_error_pct,
 *   expected_protein_g, actual_protein_g, protein_error_pct,
 *   expected_fat_g, actual_fat_g, fat_error_pct,
 *   expected_carbs_g, actual_carbs_g, carbs_error_pct,
 *   confidence, final_model, escalated, input_tokens, output_tokens,
 *   cache_read_input_tokens, cache_creation_input_tokens, cost_usd
 *
 * ## 実行方法
 *   ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @pashacaro/scripts eval
 *
 * ## 採点基準(PLAN.md §5)
 *   - 料理特定率80%以上(dish_name列を目視で比較)
 *   - kcal誤差中央値 ±20%以内
 *   - protein_g誤差中央値 ±25%以内
 *   - プロンプト・閾値変更のたびに再実行して回帰確認する
 *
 * ## 注意
 *   この環境(開発・CI)には ANTHROPIC_API_KEY も実画像(test-images/)も無いため、
 *   本スクリプトは「今は実行しない」。test-images/ が無い場合は明確なエラーで
 *   終了する(下記参照)。実画像・APIキーが揃った環境で実行すること。
 */

import { readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  AnalysisSchema,
  SYSTEM_PROMPT,
  computeAnalysisCostUsd,
  computePfcErrorPercent,
  evaluateEscalation,
  medianErrorPercent,
  todayInTokyo,
  type Analysis,
} from "@pashacaro/shared";

// apps/api/src/lib/analyze.ts と同じモデルID(日付サフィックス禁止)。
// scriptsパッケージはapps/apiに依存しないため、パイプラインの最小ロジックを
// ここに複製している。analyze.tsのロジックを変更した場合はここも追従すること。
const HAIKU_MODEL = "claude-haiku-4-5";
const SONNET_MODEL = "claude-sonnet-4-6";

const TEST_IMAGES_DIR = path.resolve(import.meta.dirname, "../test-images");
const EXPECTED_CSV_PATH = path.join(TEST_IMAGES_DIR, "expected.csv");

type ModelName = typeof HAIKU_MODEL | typeof SONNET_MODEL;

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

interface ExpectedRow {
  filename: string;
  dish_name: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
}

interface PipelineResult {
  parsed: Analysis | null;
  finalModel: ModelName;
  escalated: boolean;
  usage: Usage;
}

function emptyUsage(): Usage {
  return { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
}

function addUsage(total: Usage, usage: Anthropic.Messages.Usage): void {
  total.input_tokens += usage.input_tokens;
  total.output_tokens += usage.output_tokens;
  total.cache_read_input_tokens += usage.cache_read_input_tokens ?? 0;
  total.cache_creation_input_tokens += usage.cache_creation_input_tokens ?? 0;
}

async function callModel(
  client: Anthropic,
  model: ModelName,
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  context: string,
): Promise<{ parsed: Analysis | null; usage: Anthropic.Messages.Usage }> {
  const response = await client.messages.parse({
    model,
    max_tokens: 2048,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
          { type: "text", text: context },
        ],
      },
    ],
    output_config: { format: zodOutputFormat(AnalysisSchema) },
  });
  return { parsed: response.parsed_output, usage: response.usage };
}

/**
 * Haiku→Sonnetエスカレーションを含むパイプライン(apps/api/src/lib/analyze.ts の
 * runAnalysisPipeline と同等)。
 */
async function runPipeline(
  client: Anthropic,
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp",
  context: string,
): Promise<PipelineResult> {
  const usage = emptyUsage();

  let haiku = await callModel(client, HAIKU_MODEL, imageBase64, mediaType, context);
  addUsage(usage, haiku.usage);

  let alreadyRetried = false;
  if (haiku.parsed === null) {
    haiku = await callModel(client, HAIKU_MODEL, imageBase64, mediaType, context);
    addUsage(usage, haiku.usage);
    alreadyRetried = true;
  }

  const haikuEscalation = evaluateEscalation({ parsed: haiku.parsed, alreadyRetried });
  if (!haikuEscalation.shouldEscalate) {
    return { parsed: haiku.parsed, finalModel: HAIKU_MODEL, escalated: false, usage };
  }

  const sonnet = await callModel(client, SONNET_MODEL, imageBase64, mediaType, context);
  addUsage(usage, sonnet.usage);

  return { parsed: sonnet.parsed, finalModel: SONNET_MODEL, escalated: true, usage };
}

function mediaTypeFromExt(filename: string): "image/jpeg" | "image/png" | "image/webp" {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

/** 簡易CSVパーサ(ダブルクォート・カンマ区切り、改行はLF/CRLF両対応)。 */
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && content[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((c) => c.length > 0) || row.length > 1) {
        rows.push(row);
      }
      row = [];
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function csvField(value: string | number): string {
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function loadExpected(): Promise<ExpectedRow[]> {
  const content = await readFile(EXPECTED_CSV_PATH, "utf-8");
  const rows = parseCsv(content);
  const [header, ...dataRows] = rows;
  if (!header) {
    return [];
  }
  const colIndex = (name: string) => header.indexOf(name);
  const idx = {
    filename: colIndex("filename"),
    dish_name: colIndex("dish_name"),
    kcal: colIndex("kcal"),
    protein_g: colIndex("protein_g"),
    fat_g: colIndex("fat_g"),
    carbs_g: colIndex("carbs_g"),
  };

  return dataRows
    .filter((r) => r.length >= header.length && r[idx.filename])
    .map((r) => ({
      filename: r[idx.filename]!,
      dish_name: r[idx.dish_name] ?? "",
      kcal: Number(r[idx.kcal] ?? 0),
      protein_g: Number(r[idx.protein_g] ?? 0),
      fat_g: Number(r[idx.fat_g] ?? 0),
      carbs_g: Number(r[idx.carbs_g] ?? 0),
    }));
}

async function main(): Promise<void> {
  if (!existsSync(TEST_IMAGES_DIR) || !existsSync(EXPECTED_CSV_PATH)) {
    console.error(
      `test-images/ または test-images/expected.csv が見つかりません (${TEST_IMAGES_DIR})。\n` +
        "PLAN.md §5に記載の30枚の評価用画像と expected.csv を配置してから実行してください。\n" +
        "形式: expected.csv のヘッダーは filename,dish_name,kcal,protein_g,fat_g,carbs_g",
    );
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error("ANTHROPIC_API_KEY が設定されていません。実APIキーのある環境で実行してください。");
    process.exitCode = 1;
    return;
  }

  const client = new Anthropic({ apiKey });
  const expectedRows = await loadExpected();

  if (expectedRows.length === 0) {
    console.error("expected.csv に有効な行がありません。");
    process.exitCode = 1;
    return;
  }

  const outputRows: string[][] = [
    [
      "filename",
      "expected_dish_name",
      "actual_dish_name",
      "expected_kcal",
      "actual_kcal",
      "kcal_error_pct",
      "expected_protein_g",
      "actual_protein_g",
      "protein_error_pct",
      "expected_fat_g",
      "actual_fat_g",
      "fat_error_pct",
      "expected_carbs_g",
      "actual_carbs_g",
      "carbs_error_pct",
      "confidence",
      "final_model",
      "escalated",
      "input_tokens",
      "output_tokens",
      "cache_read_input_tokens",
      "cache_creation_input_tokens",
      "cost_usd",
    ],
  ];

  const kcalErrors: number[] = [];
  const proteinErrors: number[] = [];
  let totalCostUsd = 0;

  for (const expected of expectedRows) {
    const imagePath = path.join(TEST_IMAGES_DIR, expected.filename);
    if (!existsSync(imagePath)) {
      console.error(`画像が見つかりません: ${imagePath} (スキップ)`);
      continue;
    }

    console.log(`解析中: ${expected.filename}`);
    const imageBuffer = await readFile(imagePath);
    const imageBase64 = imageBuffer.toString("base64");
    const mediaType = mediaTypeFromExt(expected.filename);
    const context = "撮影時刻: 12:30。ユーザー補足: なし(eval.ts による精度評価リクエストです)";

    const result = await runPipeline(client, imageBase64, mediaType, context);

    const actualDishName = result.parsed?.dishes.map((d) => d.name).join(" / ") ?? "(parse_failed)";
    const actualTotal = result.parsed?.total ?? { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
    const confidence =
      result.parsed && result.parsed.dishes.length > 0
        ? result.parsed.dishes.reduce((sum, d) => sum + d.confidence, 0) / result.parsed.dishes.length
        : 0;

    const errorPct = computePfcErrorPercent(actualTotal, expected);
    const costUsd = computeAnalysisCostUsd({ model: result.finalModel, ...result.usage });
    totalCostUsd += costUsd;

    if (Number.isFinite(errorPct.kcal)) kcalErrors.push(errorPct.kcal);
    if (Number.isFinite(errorPct.protein_g)) proteinErrors.push(errorPct.protein_g);

    outputRows.push([
      expected.filename,
      expected.dish_name,
      actualDishName,
      String(expected.kcal),
      String(actualTotal.kcal),
      errorPct.kcal.toFixed(2),
      String(expected.protein_g),
      String(actualTotal.protein_g),
      errorPct.protein_g.toFixed(2),
      String(expected.fat_g),
      String(actualTotal.fat_g),
      errorPct.fat_g.toFixed(2),
      String(expected.carbs_g),
      String(actualTotal.carbs_g),
      errorPct.carbs_g.toFixed(2),
      confidence.toFixed(3),
      result.finalModel,
      String(result.escalated),
      String(result.usage.input_tokens),
      String(result.usage.output_tokens),
      String(result.usage.cache_read_input_tokens),
      String(result.usage.cache_creation_input_tokens),
      costUsd.toFixed(6),
    ]);
  }

  const csvContent = outputRows.map((row) => row.map(csvField).join(",")).join("\n") + "\n";
  const outputPath = path.join(TEST_IMAGES_DIR, `results-${todayInTokyo()}.csv`);
  await writeFile(outputPath, csvContent, "utf-8");

  console.log("");
  console.log(`出力: ${outputPath}`);
  console.log(`kcal誤差中央値: ${medianErrorPercent(kcalErrors)?.toFixed(2) ?? "N/A"}%`);
  console.log(`protein誤差中央値: ${medianErrorPercent(proteinErrors)?.toFixed(2) ?? "N/A"}%`);
  console.log(`合計コスト: $${totalCostUsd.toFixed(4)}`);
  console.log("");
  console.log(
    "採点基準(PLAN.md §5): 料理特定率80%以上(目視)、kcal誤差中央値±20%以内、protein誤差中央値±25%以内",
  );
}

main().catch((err) => {
  console.error("eval failed:", err);
  process.exitCode = 1;
});
