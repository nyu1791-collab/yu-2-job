/**
 * scripts/ingest-mext.ts
 *
 * 日本食品標準成分表(八訂)増補2023年 取り込みスクリプト(PLAN.md §4.2 / §4.3)。
 *
 * 実運用フロー:
 *   1. 文部科学省の公開Excel(MEXT_EXCEL_URL)をダウンロード
 *   2. xlsx でシートをパースし、食品番号・食品名・100gあたりkcal/たんぱく質/脂質/炭水化物を抽出
 *   3. food_db テーブルへ truncate -> 一括insert(冪等)
 *   4. food_aliases も初期データを truncate -> 一括insert
 *
 * 実行方法:
 *   DATABASE_URL=postgres://... pnpm --filter @pashacaro/scripts ingest-mext
 *     -> MEXT_EXCEL_URL からExcelをダウンロードして取り込む(本番/ステージング用)
 *
 *   DATABASE_URL=postgres://... pnpm --filter @pashacaro/scripts ingest-mext --seed
 *     -> scripts/seed-data/food-db-seed.ts のローカルデータ(代表的な食品約200件 + alias約130件)を
 *        food_db / food_aliases へ投入する(truncate -> 再投入、冪等)。
 *
 * 注意: この開発環境では文科省サイト(mext.go.jp)へのアクセスが403で禁止されているため、
 * --seed なしでの実行(Excelダウンロード)はこの環境では行わない。
 * --seed フラグでのローカルseedデータ投入のみテスト・ローカル開発で使用する。
 */

import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import { normalizeFoodName } from "@pashacaro/shared";
import { FOOD_ALIASES_SEED, FOOD_DB_SEED, type FoodSeed } from "./seed-data/food-db-seed.js";

/**
 * 文部科学省「日本食品標準成分表(八訂)増補2023年」本表(Excel)の公開URL。
 *
 * 出典:文部科学省 / 食品成分データベース
 * https://www.mext.go.jp/a_menu/syokuhinseibun/mext_01110.html
 *
 * 実際のファイル名・URLは改訂のたびに変わる可能性があるため、実行時に最新の
 * リンクを文科省サイトで確認すること。この環境からは403でアクセス不可。
 */
export const MEXT_EXCEL_URL =
  "https://www.mext.go.jp/component/a_menu/education/micro_detail/__icsFiles/afieldfile/2023/04/14/excel_8_1.xlsx";

/** food_db の1行(取り込み後の正規化済みレコード)。 */
export interface FoodDbRow {
  foodCode: string;
  name: string;
  nameNormalized: string;
  groupCode: string;
  kcal100g: number;
  protein100g: number;
  fat100g: number;
  carbs100g: number;
}

/**
 * MEXT Excelの行データを FoodDbRow へ変換する。
 *
 * 八訂Excelの本表は概ね以下の列構成(行頭にヘッダー数行あり):
 *   - 食品群 (group_code, 2桁)
 *   - 食品番号 (food_code, 5桁)
 *   - 食品名
 *   - エネルギー(kcal)
 *   - たんぱく質(g)
 *   - 脂質(g)
 *   - 炭水化物(g)
 *
 * 値が "Tr"(微量)・"-"(未測定)等の場合は0として扱う。
 */
export function parseMextRow(row: {
  groupCode: string;
  foodCode: string;
  name: string;
  kcal: string | number;
  protein: string | number;
  fat: string | number;
  carbs: string | number;
}): FoodDbRow {
  return {
    foodCode: row.foodCode,
    name: row.name,
    nameNormalized: normalizeFoodName(row.name),
    groupCode: row.groupCode,
    kcal100g: parseNumericCell(row.kcal),
    protein100g: parseNumericCell(row.protein),
    fat100g: parseNumericCell(row.fat),
    carbs100g: parseNumericCell(row.carbs),
  };
}

/** "Tr"(微量)・"-"(未測定)・"(0)" 等を0として扱い、それ以外は数値化する。 */
export function parseNumericCell(value: string | number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const trimmed = value.trim().replace(/[()]/g, "");
  if (trimmed === "" || trimmed === "Tr" || trimmed === "-" || trimmed === "*") {
    return 0;
  }
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * MEXT公開ExcelをダウンロードしてFoodDbRow[]へパースする。
 *
 * この環境ではmext.go.jpへのアクセスが403のため呼び出し不可。
 * 実運用環境(ANTHROPIC_API_KEY等が揃った本番/CI)で実行すること。
 */
export async function downloadAndParseMextExcel(url: string = MEXT_EXCEL_URL): Promise<FoodDbRow[]> {
  const XLSX = await import("xlsx");

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`MEXT Excelのダウンロードに失敗しました: ${res.status} ${res.statusText}`);
  }
  const buffer = await res.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "buffer" });

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error("Excelにシートが見つかりません。");
  }
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`シート ${sheetName} が読み込めません。`);
  }

  // header: 1 を指定した場合、各行は連想配列ではなく配列(unknown[])として返る。
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  const result: FoodDbRow[] = [];
  for (const arr of rows) {
    // 列位置は実際のExcelレイアウトに合わせて調整が必要。
    // 八訂本表は概ね: [食品群, 食品番号, 索引番号, 食品名, ... , エネルギー, たんぱく質, 脂質, ..., 炭水化物, ...]
    const groupCode = String(arr[0] ?? "").trim();
    const foodCode = String(arr[1] ?? "").trim();
    const name = String(arr[3] ?? "").trim();

    // ヘッダー行・空行はスキップ(食品番号が5桁数値でない場合)
    if (!/^\d{5}$/.test(foodCode) || !name) {
      continue;
    }

    const kcal = arr[6] as string | number;
    const protein = arr[8] as string | number;
    const fat = arr[10] as string | number;
    const carbs = arr[12] as string | number;

    result.push(
      parseMextRow({
        groupCode,
        foodCode,
        name,
        kcal: kcal ?? 0,
        protein: protein ?? 0,
        fat: fat ?? 0,
        carbs: carbs ?? 0,
      }),
    );
  }

  return result;
}

/** scripts/seed-data/food-db-seed.ts のローカルデータを FoodDbRow[] / alias配列 に変換する。 */
export function buildSeedRows(): { foods: FoodDbRow[]; aliasFoodNames: Map<string, string> } {
  const foods: FoodDbRow[] = FOOD_DB_SEED.map((f: FoodSeed) => ({
    foodCode: f.foodCode,
    name: f.name,
    nameNormalized: normalizeFoodName(f.name),
    groupCode: f.groupCode,
    kcal100g: f.kcal100g,
    protein100g: f.protein100g,
    fat100g: f.fat100g,
    carbs100g: f.carbs100g,
  }));

  const aliasFoodNames = new Map<string, string>();
  for (const a of FOOD_ALIASES_SEED) {
    aliasFoodNames.set(a.alias, a.foodName);
  }

  return { foods, aliasFoodNames };
}

/**
 * food_db / food_aliases へ取り込む(truncate -> insert、冪等)。
 *
 * @param rows food_db に投入する行
 * @param aliasFoodNames alias(正規化前の表記) -> food_db.name のマップ
 */
export async function ingest(
  databaseUrl: string,
  rows: FoodDbRow[],
  aliasFoodNames: Map<string, string>,
): Promise<{ foodCount: number; aliasCount: number }> {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);

  try {
    await db.execute(sql`TRUNCATE TABLE food_aliases, food_db RESTART IDENTITY CASCADE`);

    for (const row of rows) {
      await db.execute(sql`
        INSERT INTO food_db (food_code, name, name_normalized, group_code, kcal_100g, protein_100g, fat_100g, carbs_100g)
        VALUES (${row.foodCode}, ${row.name}, ${row.nameNormalized}, ${row.groupCode}, ${row.kcal100g}, ${row.protein100g}, ${row.fat100g}, ${row.carbs100g})
      `);
    }

    let aliasCount = 0;
    for (const [alias, foodName] of aliasFoodNames.entries()) {
      const normalizedAlias = normalizeFoodName(alias);
      const found = await db.execute<{ id: number }>(sql`
        SELECT id FROM food_db WHERE name = ${foodName} LIMIT 1
      `);
      const foodDbId = (found.rows[0] as { id: number } | undefined)?.id;
      if (foodDbId === undefined) {
        console.warn(`[ingest-mext] alias "${alias}" の参照先食品 "${foodName}" が見つかりません。スキップします。`);
        continue;
      }
      await db.execute(sql`
        INSERT INTO food_aliases (alias, food_db_id)
        VALUES (${normalizedAlias}, ${foodDbId})
      `);
      aliasCount += 1;
    }

    return { foodCount: rows.length, aliasCount };
  } finally {
    await pool.end();
  }
}

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("DATABASE_URL が設定されていません。");
    process.exitCode = 1;
    return;
  }

  const useSeed = process.argv.includes("--seed");

  if (useSeed) {
    console.log("[ingest-mext] --seed: ローカルseedデータ(scripts/seed-data/food-db-seed.ts)を投入します。");
    const { foods, aliasFoodNames } = buildSeedRows();
    const result = await ingest(databaseUrl, foods, aliasFoodNames);
    console.log(`[ingest-mext] food_db: ${result.foodCount}件, food_aliases: ${result.aliasCount}件 を投入しました。`);
    return;
  }

  console.log("[ingest-mext] 文部科学省「日本食品標準成分表(八訂)増補2023年」をダウンロードして取り込みます。");
  console.log(`[ingest-mext] URL: ${MEXT_EXCEL_URL}`);
  console.warn(
    "[ingest-mext] 注意: この開発環境ではmext.go.jpへのアクセスが403で禁止されているため、" +
      "実行に失敗する可能性があります。本番/CI環境で実行してください。",
  );

  const rows = await downloadAndParseMextExcel();
  const { aliasFoodNames } = buildSeedRows();
  const result = await ingest(databaseUrl, rows, aliasFoodNames);
  console.log(`[ingest-mext] food_db: ${result.foodCount}件, food_aliases: ${result.aliasCount}件 を投入しました。`);
}

const isMainModule = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  main().catch((err) => {
    console.error("[ingest-mext] failed:", err);
    process.exitCode = 1;
  });
}
