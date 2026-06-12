# 事業計画: 写真AI食事管理アプリ「パシャカロ(仮称)」

> 本計画は Fable が立案。実装(コード)は Sonnet が「4. 実装指示」に従って行う。
> リポジトリ: nyu1791-collab/yu-2-job / ブランチ: claude/business-idea-planning-mdjjli
> ※ 旧計画(習い事教室向けSaaS)はユーザー指示により「アプリ系で課金が成立するもの」へ方針転換し、本計画に置き換え。

## 1. Context — なぜこの事業か

「アプリ系で、お金を払ってもらえる事業」という要件に対し、**実際に課金が成立しているカテゴリの証拠**から逆算して選定した。

### 決定的な実証データ
1. **Cal AI(米国)**: 写真を撮るだけのカロリー記録アプリ。10代2人で開発し、ARR約3,000〜3,500万ドル(約50億円)に到達、MyFitnessPalが買収。**極小チーム+AI APIでこのカテゴリの課金が成立することの直近の実証例**
   - [Getlatka: Cal AI Revenue $35M ARR](https://getlatka.com/companies/calai.app) / [CNBC](https://www.cnbc.com/2025/09/06/cal-ai-how-a-teenage-ceo-built-a-fast-growing-calorie-tracking-app.html) / [TechCrunch](https://techcrunch.com/2025/03/16/photo-calorie-app-cal-ai-downloaded-over-a-million-times-was-built-by-two-teenagers/)
2. **あすけん(国内)**: 累計会員1,300万人・MAU132万、国内Nutrition&Dietジャンルでダウンロード数/売上/アクティブユーザー数4年連続No.1。**日本でも食事管理への課金は実証済み**
   - [asken公式](https://www.asken.inc/news/20260114) / [PR TIMES](https://prtimes.jp/main/html/rd/p/000000212.000058653.html)
3. 比較検討して退けた候補: AI英会話(Speakが日本でARR約$50Mと強すぎる — [Business Insider](https://www.businessinsider.jp/article/279447/))、マンガ/動画(コンテンツ制作がソロ不可)、マッチング(運営・規制負荷)、AIメンタルジャーナリング(WTPが食事管理より弱い)、親の介護共有ノート(獲得チャネル未実証)

### 勝ち筋(市場の隙間)
- あすけんは**手入力中心のUX**で、ユーザー層は女性ダイエット層に寄っている。Cal AIが証明した「**写真だけ・3秒記録**」のUXの飛躍が日本語圏では空白
- Cal AI(英語圏)は**和食・コンビニ商品に弱い**。「肉じゃが」「冷奴」「セブンのサラダチキン」を正しく認識・栄養化できることが防壁になる
- 初期ビーチヘッドは**筋トレ・ボディメイク層(20-40代男性中心)のPFC管理**。あすけんが弱いセグメントで、プロテイン市場の成長と重なり、SNSで到達しやすく、課金意欲が高い

### ユニットエコノミクスが成立する(調査済み)
- 解析原価: Claude Haiku 4.5(vision)で写真1枚**約0.3〜0.5円**(入力$1/100万トークン、写真1枚≒1,100〜1,600トークン+JSON出力)。難しい皿のみSonnet 4.6へエスカレーションしても1枚約1.5円
- ヘビーユーザー(月150枚)でも原価約50〜150円 vs 月額980円 → **粗利率85〜95%**
- プロンプトキャッシングでシステムプロンプト部分は約1/10のコストに圧縮可能

## 2. 事業概要

| 項目 | 内容 |
|---|---|
| プロダクト | 写真を撮るだけ3秒で食事記録。料理認識→グラム推定→PFC・カロリー自動計算 |
| 顧客 | 初期: 筋トレ・ボディメイク層(20-40代)。拡張: 一般ダイエット層、糖質制限、妊娠期栄養 |
| 価格 | ハードペイウォール+**7日無料トライアル → 月980円 / 年6,800円**(Cal AIと同型。あすけんプレミアム(年契約月480円)より高いが「記録ゼロ」の体験価値で正当化) |
| 差別化 | ①和食・定食・コンビニ商品の認識精度 ②PFC特化UI(タンパク質残量を最上位に) ③記録摩擦ゼロ(写真→3秒→確定) |
| 形態 | iOS/Androidネイティブアプリ(Expo)。バックエンドはサーバレス |

### 精度への基本戦略(プロダクトの中核洞察)
AIに栄養値を直接言わせない。**AIは「料理名・食材分解・グラム推定」まで**を担当し、栄養値はサーバ側で**日本食品標準成分表(文部科学省の無償公開データ)と突合**して算出するハイブリッド方式。これにより (a)ハルシネーションした栄養値を排除、(b)「和食に強い」を構造的に担保、(c)モデル更新に強い。

### GTM(顧客獲得 — Cal AIのプレイブックを踏襲)
1. **TikTok/Instagram Reels**: 「今日の食事これで足りてる?」型のbefore/after・解析デモ動画。筋トレ系マイクロインフルエンサーへのギフティング→アフィリエイト
2. **ASO**: 「カロリー計算 写真」「PFC 管理」「ダイエット 記録 楽」での上位獲得
3. **プロダクト内蔵バイラル**: 解析結果カードのシェア画像(SNS映えするリング+写真合成)
4. **コンテンツSEO**: 「サラダチキン PFC」「吉野家 牛丼 タンパク質」等の食品データページを成分表DBから自動生成

### KPI
- 北極星: **週4日以上記録するアクティブ課金者数**(継続=成果実感=低解約)
- ファネル: インストール→トライアル開始率(目標35%)→トライアル→課金転換(目標40%)→月次解約率(目標8%未満)
- 解析品質: 確定前の手修正率(目標30%未満)、解析失敗率(2%未満)

### 目標
- 6ヶ月: 課金1,000人(MRR約80万円) / 12ヶ月: 課金5,000人(MRR約400万円) / 24ヶ月: 課金2万人(MRR約1,600万円)

### リスクと対応
| リスク | 対応 |
|---|---|
| あすけんのAI写真機能強化 | あすけんは「栄養指導アプリ」、当方は「記録ゼロ体験」。UXの軸が違う。筋トレPFC特化UIで別ポジションを先取 |
| Cal AI(MyFitnessPal)の日本語化 | 和食・コンビニ商品DBと日本の成分表突合がローカル防壁。先行してDB資産を蓄積 |
| 解析精度への不満→解約 | confidence表示+ワンタップ修正UX+修正データの蓄積で改善ループ。「±15%の目安」と正直に伝えるトーン |
| APIコスト暴走 | レート制限、画像縮小(長辺1024px)、プロンプトキャッシュ、コスト監視アラート(§4) |
| 薬機法・健康増進法 | 「診断・治療」を示唆しない表現に統一。医療助言ではなく記録ツールとして訴求。景表法のbefore/after表現ガイド遵守 |
| App Store審査(健康系・サブスク) | 復元ボタン・解約導線・栄養データの取扱明示(HealthKit連携はPhase 2で慎重に) |
| 名称・商標 | 「パシャカロ」は仮称。ローンチ前に商標・既存アプリ名(カロミル等)との衝突を確認 |

## 3. MVPスコープ(Phase 1)
1. オンボーディング: 目標設定(減量/維持/増量→目標PFC自動計算)→ペイウォール(7日トライアル)→Apple/Googleサインイン
2. 写真→AI解析→結果カード(料理ごとのPFC/kcal/信頼度)→ワンタップ確定、分量スライダー・料理名修正
3. テキスト入力の補助経路(「カレーライス大盛り」→AI推定)
4. ホーム: 今日のカロリー・P/F/C残量リング+食事タイムライン
5. 履歴・週次サマリー(平均PFC・目標達成率)
6. 記録リマインダー(ローカル通知)
7. コストガード: トライアル中の解析回数制限、画像クライアント縮小

### Phase 2以降
- バーコード読取(Open Food Facts JP+自前商品DB)、コンビニ商品DB拡充 → HealthKit/Google Fit連携 → AI栄養コーチチャット(継続率ドライバー) → シェア画像生成 → 体重トラッキングとグラフ

## 4. 実装指示(Sonnet向け)

### 4.0 全体方針(最初に読むこと)
- モノレポ(pnpm workspaces)。Zodスキーマ・栄養計算・突合ロジックは `packages/shared` の**純関数**に置き、モバイル/API双方から import し、Vitestでテストする
- 日付は **Asia/Tokyo 固定**で `DATE` 保存(単一国サービス。UTC変換禁止)
- AIモデルIDは文字列リテラルで `claude-haiku-4-5` / `claude-sonnet-4-6` を正確に使用。**日付サフィックス禁止**
- AI推定値は「仮説」、日本食品標準成分表との突合結果が「正」。補正ロジックは決定的な純関数にする

```
リポジトリ構成:
  apps/mobile/    # Expo (React Native) + TypeScript + Expo Router
  apps/api/      # Hono on Vercel (Node runtime) + Drizzle + Neon
  packages/shared/  # Zodスキーマ, PFC目標計算, 成分表突合, 型
  scripts/ingest-mext.ts  # 食品標準成分表Excel → food_db 取り込み
  scripts/eval.ts         # テスト画像一括解析・精度評価
  test-images/            # 評価用画像セット(30枚+期待値CSV)
  drizzle/                # マイグレーション
```

### 4.1 全体アーキテクチャ
```
Expo App (expo-camera / expo-image-manipulator / react-native-purchases /
          expo-notifications / Apple・Googleサインイン)
   │ JWT付きHTTPS(画像はbase64)          課金はストア直 → RevenueCat → Webhook
   ▼
Hono API on Vercel(Node runtime)
   /v1/auth/*(Apple/Google IDトークンをJWKS検証→自前JWT)
   /v1/analyze(entitlement+レート制限ゲート)→ Anthropic API
       claude-haiku-4-5(通常)/ claude-sonnet-4-6(エスカレーション)
       messages.parse + zodOutputFormat + prompt caching
   /v1/meals, /v1/summary, /v1/webhooks/revenuecat
   ▼
Neon Postgres (Drizzle)
```

**確定判断**
| 項目 | 採用 | 理由 |
|---|---|---|
| バックエンドFW | Hono on Vercel(Node runtime) | APIのみでWeb UI不要。Anthropic SDK・JWKS検証のためEdgeではなくNode runtime |
| 認証 | 自前JWT(Supabase不採用) | Apple/Googleサインインのみ。クライアントでIDトークン取得→サーバでJWKS検証→users upsert→アクセスJWT(1h)+リフレッシュトークン(expo-secure-store、DBにsha256)。ベンダーをNeon+RevenueCat+Anthropicの3つに抑える |
| 画像 | クライアントで長辺1024px/JPEG品質0.7に縮小→base64でPOST | 1枚≒1,100〜1,600トークン。画像はサーバに保存しない(サムネは端末ローカルのみ) |
| 課金ゲート | サーバ側でも検証 | クライアントのentitlementを信用せず、/v1/analyzeはsubscriptionsテーブル(Webhook同期)を毎回チェック |

### 4.2 AI解析パイプライン

**Zodスキーマ(`packages/shared/src/analysis-schema.ts`)**
```ts
import { z } from "zod";

export const IngredientSchema = z.object({
  name: z.string().describe("食材名。可能な限り日本食品標準成分表の食品名に近い一般名詞(例: 精白米, 鶏もも肉 皮つき, 木綿豆腐)"),
  grams: z.number().describe("この皿に含まれる推定グラム数"),
});

export const DishSchema = z.object({
  name: z.string().describe("料理名(日本語)。例: 鶏の唐揚げ, カレーライス"),
  ingredients: z.array(IngredientSchema).describe("料理を構成する主要食材の分解。栄養はサーバ側で成分表と突合するため、ここが最重要"),
  estimated_grams: z.number().describe("皿全体の推定総重量(g)"),
  kcal: z.number(), protein_g: z.number(), fat_g: z.number(), carbs_g: z.number(),
  confidence: z.number().describe("0〜1。料理の特定とグラム推定の確信度。隠れた油・調味料・部分的に見えない皿は低くする"),
});

export const AnalysisSchema = z.object({
  is_food: z.boolean().describe("食事の写真でなければfalse"),
  dishes: z.array(DishSchema),
  total: z.object({ kcal: z.number(), protein_g: z.number(), fat_g: z.number(), carbs_g: z.number() }),
  meal_type: z.enum(["breakfast", "lunch", "dinner", "snack", "unknown"]),
  notes: z.string().nullable().describe("ユーザーに見せる補足。不確実な点や確認してほしい点"),
});
export type Analysis = z.infer<typeof AnalysisSchema>;
```
注意: structured outputsは数値のmin/max制約非対応(SDKが除去しクライアント側検証)。confidenceの0〜1は`.describe()`で指示し、突合関数側でclamp。

**API呼び出し(`apps/api/src/lib/analyze.ts`)**
```ts
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const client = new Anthropic(); // ANTHROPIC_API_KEY

export async function callModel(model: "claude-haiku-4-5" | "claude-sonnet-4-6",
                                imageBase64: string, mediaType: "image/jpeg", context: string) {
  const response = await client.messages.parse({
    model,
    max_tokens: 2048,
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
        { type: "text", text: context }, // 例: "撮影時刻: 12:30。ユーザー補足: なし"
      ],
    }],
    output_config: { format: zodOutputFormat(AnalysisSchema) },
  });
  return { parsed: response.parsed_output, usage: response.usage }; // parsedはnullになり得る
}
```

**システムプロンプト設計方針(SYSTEM_PROMPT、完全に静的な文字列1本)**
1. 役割: 日本の食事写真の栄養推定専門家。和食・コンビニ商品・定食文化に精通
2. 和食特有の指示: 定食は主菜・副菜・汁物・米飯を個別dishに/丼・カレーは飯と具を食材分解/揚げ物は吸油考慮(+10〜15%油)/味噌汁180g等の定番量/コンビニ商品はパッケージの商品名が読めれば商品名をnameに
3. グラム推定基準表: 茶碗1杯=150g、丼飯=250〜300g、唐揚げ1個=25〜30g、卵1個=50g、食パン6枚切り=60g…
4. 部分推定: 見切れは外挿しconfidenceを下げる/食べかけは残量推定
5. confidence基準: 0.9+=商品特定・全体可視 / 0.6〜0.8=料理特定済みだが量に不確実性 / 0.4〜0.6=中身に不確実性 / <0.4=判別困難
6. 食品参照リスト: food_dbの頻出500〜800件の正式名称+別名対応の抜粋を列挙し「ingredients.nameはこの表記を優先」と指示
→ 合計**4,096トークン以上**にする(Haiku 4.5の最小キャッシュ単位。下回ると黙ってキャッシュされない)。タイムスタンプ等の動的要素は絶対に入れない。

**Haiku→Sonnetエスカレーション(`packages/shared/src/escalation.ts` 純関数)** — 以下のいずれかでSonnetに同一プロンプト・同一画像で再解析:
1. `parsed_output === null`(まずHaikuで1回リトライ、再失敗でSonnet)
2. `min(confidence) < 0.45` またはグラム重み付き平均confidence < 0.6
3. `dishes.length >= 4` かつ平均confidence < 0.7
4. 整合性チェック失敗: `|4P+9F+4C−kcal|/kcal > 0.3`、または total.kcal が [20, 3500] 範囲外
Sonnetでも2〜4を満たさなければ結果採用+`analysis_logs.flagged=true`。エスカレーション率は常時計測(目標15%以下)。キャッシュはモデル別(Sonnet側にも初回書き込みが発生)。

**成分表突合(`packages/shared/src/nutrition-match.ts` — ハイブリッド方式の核心)**
- 取り込み(`scripts/ingest-mext.ts`): 文科省「日本食品標準成分表(八訂)増補2023年」公開Excel→約2,500食品をfood_dbへ(食品番号、名称、100gあたりkcal/P/F/C)。冪等(truncate→再投入)
- 突合: ①NFKC正規化・空白除去・ひらがな化 → ②food_aliases完全一致(初期100件手動投入、運用でログから追加)→ ③pg_trgm similarity上位1件(閾値0.45)→ ④dishごとにマッチ食材のグラム比カバレッジ計算: ≥70%なら栄養値=Σ(成分表100g値×grams/100)+未マッチ分はAI値按分で `corrected=true`、<70%ならAI値のまま `corrected=false` → ⑤補正後kcalがAI推定と40%以上乖離ならconfidence−0.15+notesに「量を確認してください」→ ⑥totalはdish補正後の合算で再計算(AIのtotalは信用しない)

**失敗時UX**
| 状況 | サーバ応答 | クライアント挙動 |
|---|---|---|
| `is_food: false` | 200 + `{error_kind:"not_food"}` | 「食事が写っていないようです」+再撮影/手動入力 |
| パース失敗(両モデル) | 422 | 「うまく解析できませんでした」+再試行/手動入力。レート制限カウント外 |
| 低confidence(<0.5) | 200(結果は返す) | 「⚠ 推定精度が低めです」バッジ+分量スライダーを開いた状態で表示 |
| タイムアウト/529 | 503 | 自動1回リトライ→失敗で再試行ボタン |
| レート制限超過 | 429 | 「本日の解析上限に達しました」+アップグレード導線 |

### 4.3 データモデル(Drizzle、M2で一括マイグレーション)
```sql
users          (id uuid PK, apple_sub unique null, google_sub unique null, email null,
                display_name null, rc_app_user_id unique null, created_at, deleted_at null)
refresh_tokens (id PK, user_id FK, token_hash unique, expires_at, created_at)
goals          (id PK, user_id FK, goal_type /*cut|maintain|bulk*/, weight_kg, height_cm,
                age, sex, activity_level, target_kcal, target_protein_g, target_fat_g,
                target_carbs_g, effective_from date, created_at)  -- 履歴を残す
meals          (id PK, user_id FK, eaten_on date, eaten_at time,
                meal_type, source /*photo|text|manual*/,
                total_kcal, total_protein_g, total_fat_g, total_carbs_g,
                analysis_log_id FK null, created_at, deleted_at null)
meal_items     (id PK, meal_id FK, name, grams, kcal, protein_g, fat_g, carbs_g,
                confidence, corrected bool, food_db_id FK null,
                user_edited bool default false, sort_order)
food_db        (id PK, food_code unique, name, name_normalized /*GIN gin_trgm_ops*/,
                group_code, kcal_100g, protein_100g, fat_100g, carbs_100g)
food_aliases   (id PK, alias unique, food_db_id FK)
analysis_logs  (id PK, user_id FK, model, escalated bool, flagged bool,
                input_tokens, output_tokens, cache_read_input_tokens,
                cache_creation_input_tokens, latency_ms,
                status /*ok|parse_failed|not_food|error*/, raw_response jsonb null, created_at)
subscriptions  (id PK, user_id FK unique, rc_app_user_id, entitlement,
                status /*trial|active|billing_issue|expired*/, product_id,
                expires_at timestamptz, last_event_at, raw_last_event jsonb)
barcode_products (id PK, jan_code unique, name, brand, kcal, protein_g, fat_g, carbs_g,
                per, source /*off_jp|manual*/)  -- Phase 2布石。MVPは定義のみ
```
- レート制限は専用テーブルなし。`analysis_logs` の当日カウント(status != 'error')で判定
- PFC目標計算(`packages/shared/src/goal-calc.ts` 純関数): Mifflin-St Jeor式でBMR→活動係数(1.2〜1.725)→減量−300kcal/維持±0/増量+250kcal。P=体重×2.0g(筋トレ層向け)、F=総kcalの25%、C=残り

### 4.4 画面一覧(Expo Router)
```
apps/mobile/app/
  _layout.tsx               # ルートガード: 未サインイン→(onboarding)、entitlement無→paywall
  (onboarding)/welcome.tsx / goal/step1.tsx / goal/step2.tsx / goal/result.tsx
                paywall.tsx(7日無料→月980/年6,800、RevenueCat Offerings)/ sign-in.tsx
  (tabs)/index.tsx(今日のリング+タイムライン)/ history.tsx / settings.tsx  + 中央撮影FAB
  capture/camera.tsx → analyzing.tsx(3秒演出)→ result.tsx
       # 結果カード: dishごとのPFC/kcal/confidenceバッジ、分量スライダー(0.5x〜2.0x線形再計算)、
       # 料理名修正、ワンタップ「記録する」
  capture/text-input.tsx    # 「カレーライス 大盛り」→ /v1/analyze/text
  meal/[id].tsx             # 記録詳細・編集・削除
```
オンボーディング順序: **目標設定→ペイウォール→サインイン**。RevenueCatは匿名IDで購入→サインイン後 `Purchases.logIn(userId)` でエイリアス統合。

### 4.5 API設計(Hono、/v1プレフィックス)
| Method/Path | 認証 | 内容 |
|---|---|---|
| POST /v1/auth/apple, /v1/auth/google | なし | IDトークンをJWKS検証→upsert→{accessToken, refreshToken, user} |
| POST /v1/auth/refresh | なし | リフレッシュトークンをローテーションして再発行 |
| GET/PUT /v1/me, /v1/me/goal | JWT | プロフィール/目標(更新時は新goals行をinsert) |
| GET /v1/me/entitlement | JWT | subscriptionsの現況 |
| POST /v1/analyze | JWT+entitlement+レート制限 | {imageBase64, mediaType, takenAt?}→パイプライン→Analysis+補正済み栄養+analysisLogId |
| POST /v1/analyze/text | 同上 | {text}→画像なし同スキーマ(Haiku固定、systemは同一でキャッシュ共有) |
| POST /v1/meals, GET /v1/meals?date=, PATCH/DELETE /v1/meals/:id | JWT | 確定/取得/編集/論理削除 |
| GET /v1/summary/daily?date=, /v1/summary/weekly?start= | JWT | リング用合計、週次達成率(kcal±10%圏かつP達成90%+の日) |
| POST /v1/webhooks/revenuecat | 共有シークレット | INITIAL_PURCHASE/RENEWAL/CANCELLATION/EXPIRATION/BILLING_ISSUEをupsert。event idで冪等 |

`/v1/analyze` ミドルウェア順: JWT検証→画像サイズ検証(base64 2MB超は413)→entitlementチェック(Webhook遅延に備えRevenueCat REST APIフォールバック1回)→レート制限(trial 5枚/日、有料50枚/日)→解析。

### 4.6 実装マイルストーン(各ステップ単独で動作確認可能)
- **M1 — 縦切り最優先: カメラ→AI解析→結果カード(DB・認証なし)**: モノレポ初期化、Expoアプリ(camera/analyzing/result)、Hono /v1/analyze(固定devトークン)、sharedのZodスキーマ、messages.parse+zodOutputFormat+prompt caching、エスカレーション、画像リサイズ。検証: 実機で唐揚げ定食写真→3〜6秒で結果カード。2回目リクエストで `usage.cache_read_input_tokens > 0`
- **M2 — DB基盤+成分表突合**: Neon+Drizzle全テーブル、ingest-mext.ts、aliases初期100件、突合純関数、analyze組込、analysis_logs記録、POST /v1/meals。検証: Vitest(完全一致/別名/trgm/カバレッジ分岐/乖離減点)+白米のkcalが成分表値(156kcal/100g)ベースになる
- **M3 — 認証+目標設定オンボーディング**: Apple/Googleサインイン、JWT/リフレッシュ、ルートガード、goal3画面+PFC自動計算。検証: Vitest(goal-calc)+再ログインで目標復元
- **M4 — ホーム・履歴・編集・手動入力**: リング、タイムライン、summary、分量スライダー/料理名修正→確定、meal編集、analyze/text、週次画面。検証: 3食記録→リング残量が手計算と一致、スライダー1.5xでkcal1.5倍
- **M5 — RevenueCat課金+保護**: 商品設定、ペイウォール、logIn統合、Webhook、entitlementゲート、レート制限。検証: Sandbox購入→subscriptionsがtrial→analyze通過。未購入403。6枚目429
- **M6 — 通知・精度評価・コスト監視・リリース準備**: ローカル通知(12:30/19:30、当日未記録時のみ)、eval.ts+テスト画像30枚で精度ベースライン、閾値チューニング、日次コスト集計(Vercel cron→閾値超過アラート)、EAS Build→TestFlight/内部テスト

### 4.7 コスト・運用ガード
- **プロンプトキャッシング**: systemブロック1個に静的プロンプト全文(4,096トークン以上)+`cache_control:{type:"ephemeral"}`。可変要素は必ずmessages側。`Date.now()`・ユーザーID等の補間禁止(1バイトでも変わると全無効)。連続2リクエストで`cache_read_input_tokens > 0`を確認するスクリプトを用意
- **1解析コスト目安(Haiku・キャッシュヒット)**: 読取~5,000tok×$0.10/M + 画像等~1,700tok×$1/M + 出力~600tok×$5/M ≒ **$0.005/枚**。月300枚でも~$1.5 ≪ 980円。Sonnetエスカレーション15%想定で+30%程度
- **監視**: analysis_logsに毎回トークン・モデル記録→日次cronで総コスト/ユーザー別上位/エスカレーション率/parse失敗率を通知。日次$20超でアラート。Anthropic Console側でも月次spend limit(二重防御)
- **遮断**: trial 5枚/日・有料50枚/日、同一ユーザーの同時リクエスト直列化、未認証はIP制限、2MB超413。日次トークンが平均の10倍で`flagged`、3日連続なら解析24h停止

### Phase 2への布石(実装はしない)
- barcode_productsテーブル定義済み。`scripts/ingest-off.ts` は空ファイル+TODO。analyzeレスポンス型に `matched_product_id: null` を最初から含める

## 5. 検証方法

**解析精度の評価(`scripts/eval.ts`)**
1. `test-images/` に30枚: 和食定食×6、丼・カレー×4、麺類×4、コンビニ弁当・商品×6、洋食×4、複数皿×3、低照度/斜め×3
2. `test-images/expected.csv` に人手の正解(料理名、kcal、P/F/C。コンビニ商品は栄養成分表示の実値)
3. 全画像をパイプラインに通し `results-{date}.csv` 出力(料理名一致[目視採点]、kcal誤差%、PFC誤差%、confidence、モデル、トークン数)
4. 採点基準: 料理特定率80%+、kcal誤差中央値±20%、P誤差中央値±25%。プロンプト・閾値変更のたびに再実行して回帰確認

**Vitest対象(純関数のみ、DBモック不要)**: goal-calc、nutrition-match(正規化・カバレッジ・ブレンド)、escalation判定、整合性チェック、分量スライダー線形再計算、週次達成率

**手動確認**: 各マイルストーン末尾の手順をREADMEに蓄積。課金はSandboxアカウント2台(購入済み/未購入)で確認

## 出典
- [Getlatka: Cal AI Revenue](https://getlatka.com/companies/calai.app)
- [CNBC: Cal AI story](https://www.cnbc.com/2025/09/06/cal-ai-how-a-teenage-ceo-built-a-fast-growing-calorie-tracking-app.html)
- [TechCrunch: Cal AI 1M downloads](https://techcrunch.com/2025/03/16/photo-calorie-app-cal-ai-downloaded-over-a-million-times-was-built-by-two-teenagers/)
- [asken: 国内No.1獲得](https://www.asken.inc/news/20260114)
- [PR TIMES: あすけん会員1,300万人](https://prtimes.jp/main/html/rd/p/000000212.000058653.html)
- [Business Insider: Speak有料会員10万超](https://www.businessinsider.jp/article/279447/)
- [APPLION: 国内アプリ売上ランキング](https://applion.jp/sales/jp/)
