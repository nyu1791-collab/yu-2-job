// 注意: Anthropic SDK の zodOutputFormat (apps/api/src/lib/analyze.ts) は
// zod v4 の ZodType を要求する。zod 3.25+ は "zod/v4" サブパスでv4 APIを
// 提供しているため、ここではそれを使用する(.object/.array/.describe等の
// 基本的な使い方はv3と同じ)。
import { z } from "zod/v4";

/**
 * AIモデルからの解析結果スキーマ(PLAN.md §4.2)。
 *
 * 注意: structured outputs は数値の min/max 制約に対応しない
 * (SDK が除去しクライアント側検証になる)。
 * confidence の 0〜1 は `.describe()` で指示し、突合関数側で clamp する。
 */

export const IngredientSchema = z.object({
  name: z
    .string()
    .describe(
      "食材名。可能な限り日本食品標準成分表の食品名に近い一般名詞(例: 精白米, 鶏もも肉 皮つき, 木綿豆腐)",
    ),
  grams: z.number().describe("この皿に含まれる推定グラム数"),
});
export type Ingredient = z.infer<typeof IngredientSchema>;

export const DishSchema = z.object({
  name: z.string().describe("料理名(日本語)。例: 鶏の唐揚げ, カレーライス"),
  ingredients: z
    .array(IngredientSchema)
    .describe(
      "料理を構成する主要食材の分解。栄養はサーバ側で成分表と突合するため、ここが最重要",
    ),
  estimated_grams: z.number().describe("皿全体の推定総重量(g)"),
  kcal: z.number(),
  protein_g: z.number(),
  fat_g: z.number(),
  carbs_g: z.number(),
  confidence: z
    .number()
    .describe(
      "0〜1。料理の特定とグラム推定の確信度。隠れた油・調味料・部分的に見えない皿は低くする",
    ),
});
export type Dish = z.infer<typeof DishSchema>;

export const AnalysisSchema = z.object({
  is_food: z.boolean().describe("食事の写真でなければfalse"),
  dishes: z.array(DishSchema),
  total: z.object({
    kcal: z.number(),
    protein_g: z.number(),
    fat_g: z.number(),
    carbs_g: z.number(),
  }),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack", "unknown"]),
  notes: z
    .string()
    .nullable()
    .describe("ユーザーに見せる補足。不確実な点や確認してほしい点"),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

/**
 * 成分表突合後のレスポンス用 dish 型。
 * Phase 2 布石として matched_product_id をはじめから含める(PLAN.md 4.7末尾)。
 */
export const CorrectedDishSchema = DishSchema.extend({
  corrected: z.boolean().describe("成分表突合により栄養値を補正したか"),
  matched_product_id: z
    .number()
    .nullable()
    .describe("Phase2: バーコード商品DBとのマッチID。MVPでは常にnull"),
});
export type CorrectedDish = z.infer<typeof CorrectedDishSchema>;

export const CorrectedAnalysisSchema = AnalysisSchema.extend({
  dishes: z.array(CorrectedDishSchema),
});
export type CorrectedAnalysis = z.infer<typeof CorrectedAnalysisSchema>;
