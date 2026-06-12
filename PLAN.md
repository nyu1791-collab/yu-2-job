# 事業計画: 個人習い事教室向け運営SaaS「おけいこ帳(仮称)」

> 本計画は Fable が立案。実装(コード)は Sonnet が本ファイルの「実装指示」に従って行う。
> リポジトリ: nyu1791-collab/yu-2-job(空・初コミット前)/ ブランチ: claude/business-idea-planning-mdjjli

## 1. Context — なぜこの事業か

「人々に喜んでもらい、お金を払いたくなる事業」という要件に対し、複数候補(補助金マッチングAI、保護者向けプリント管理、フリーランス事務支援など)を比較検討した結果、**個人・小規模の習い事教室(初期はピアノ・音楽教室)の講師向け運営SaaS** を選定した。

### 選定根拠(Web調査で検証済み)
- **痛みが定量的に実証されている**: ピアノ教室経営者アンケートで悩みの1位は「月謝関係」53%、「補講・レッスン関係」33%([保科陽子ピアノ経営塾](https://coachinglesson.com/piano/pianonayami/))
- **市場が大きく、かつ細分化されている**: 音楽教室市場は約1,000億円超。従事者の約77%が従業者10人未満の小規模事業所に属する = 数万の個人教室が紙の月謝袋・手帳・個人LINEで運営している([日経FCショー市場コラム](https://messe.nikkei.co.jp/fc/column/market/132894.html))
- **競合の空白が明確**:
  - 塾向け管理システム(Comiru, wagaco等)は多店舗・複数スタッフ前提で重く、月1.5万円前後と個人講師には高い([アスピック比較](https://www.aspicjapan.org/asu/article/62356), [OREND比較](https://orend.jp/mag/a0306))
  - 会費ペイ等は決済特化で、振替・レッスンノート・保護者連絡をカバーしない([会費ペイブログ](https://blog.kaihipay.jp/piano_esson_monthly/))
  - STORES予約等の汎用予約は「空き枠に予約する」モデル。習い事は「**固定曜日・固定時間の週次枠 + たまに振替**」モデルであり構造的に合わない ← **これが本事業の中核的プロダクト洞察**
- **「喜んでもらえる」構造**: 講師は振替調整の往復と月謝計算から解放され、保護者は子のレッスン記録(今日やったこと・宿題)が届いて喜ぶ。保護者側は無料なので、講師間の口コミ(発表会・ピティナ等のコミュニティ)で広がる
- **ソロ運営に向く**: 在庫なし・サポート負荷低・解約率が低い(教室運営の基幹になるため乗り換えコスト大)

## 2. 事業概要

| 項目 | 内容 |
|---|---|
| 顧客 | 個人〜小規模の習い事教室講師(生徒10〜60人)。初期セグメント: ピアノ・音楽教室。拡張: 英会話・バレエ・そろばん・書道 |
| 課金者 | 講師(B2B)。保護者・生徒側は無料 |
| 中核価値 | ①振替レッスン調整の自動化 ②月謝請求の自動計算と入金管理 ③個人LINEを使わない保護者連絡+レッスンノート |
| 形態 | モバイルファーストのWebアプリ(PWA)。保護者はアカウント登録不要(招待リンク) |

### 価格(フリーミアム)
| プラン | 価格 | 内容 |
|---|---|---|
| Free | ¥0 | 生徒8人まで。全機能 |
| Standard | ¥1,980/月 | 生徒無制限、メール通知、請求書発行 |
| Pro(Phase 2) | ¥3,980/月 | Stripe月謝オンライン決済、督促自動化、LINE通知 |

- 競合より一桁安い価格で「個人講師が自腹で即決できる」ラインに設定(月謝1人分以下)
- 目標: 12ヶ月で有料200教室(MRR約40〜60万円)、36ヶ月で1,000教室(MRR約250万円)

### GTM(顧客獲得)
1. **SEO/コンテンツ**: 「ピアノ教室 振替 ルール」「月謝 値上げ お知らせ 例文」等、講師が現に検索している悩みキーワードでテンプレ配布(規約テンプレ・お知らせ例文をリードマグネットに)
2. **Instagram/X**: ピアノ講師コミュニティが活発。教室運営Tips発信
3. **コミュニティ**: ピティナ(全日本ピアノ指導者協会)等の指導者ネットワーク、発表会での講師同士の口コミ
4. **プロダクト内蔵バイラル**: 保護者向け画面のフッターに「この教室は◯◯で運営されています」(保護者にも講師業の人が一定数いる)

### KPI
- 北極星: 週次アクティブ教室数(レッスンノート記入 or 振替処理が発生した教室)
- 補助: 招待済み保護者率、Free→有料転換率(目標8%)、月次解約率(目標2%未満)

### リスク と対応
| リスク | 対応 |
|---|---|
| wagaco等が個人向けに降りてくる | 「固定枠+振替」モデル特化のUXで先行。塾(コマ・成績)と音楽教室(固定枠・ノート)は要件が別物 |
| 講師のITリテラシー | 保護者側は登録不要リンク、講師側もスマホ完結。オンボーディングを生徒3人登録まで導線化 |
| 特商法・資金決済(Phase 2のStripe) | Stripe Connectではなく講師自身のStripeアカウント連携 or Stripe Checkoutの単純請求に留め、資金を預からない設計 |
| 名称・商標 | 「おけいこ帳」は仮称。ローンチ前に商標・既存アプリ名(おけいこ手帳等)との衝突を確認 |

## 3. MVPスコープ(Phase 1)

1. 講師サインアップ/ログイン
2. 教室設定・レッスン枠定義
3. 生徒管理(保護者連絡先、固定枠割当、兄弟リンク)
4. 講師用週間カレンダー
5. **振替フロー**(本命機能): 保護者が欠席申請 → 講師の空き枠から振替候補提示 → 保護者選択 → 確定・双方通知
6. レッスンノート(講師記入 → 保護者閲覧)
7. 保護者画面(登録不要・署名付きトークンURL・スマホ最適化)
8. 月謝管理(請求書自動生成 + 支払ステータス手動管理。オンライン決済はPhase 2)
9. 通知はメール(LINEはPhase 3)

### Phase 2以降(設計で拡張可能性のみ担保)
- Stripe月謝決済・督促自動化 → LINE Messaging API → 複数講師・発表会イベント管理

## 4. 実装指示(Sonnet向け)

### 4.0 全体方針
- タイムゾーンは **Asia/Tokyo 固定**。日付は `DATE`(`YYYY-MM-DD`)、時刻は `TIME`(`HH:mm`)でDBに保存し、UTC変換を一切行わない(単一国サービス。TZバグ根絶の最重要ルール)
- 金額は **整数円(int)**。浮動小数点禁止
- ドメインロジック(レッスン生成・振替候補計算・請求計算・状態遷移)は **純関数として `src/lib/domain/` に分離** し、Vitestでユニットテスト

### 4.1 技術スタック
| 領域 | 採用 | 理由 |
|---|---|---|
| FW | Next.js 15 (App Router) + TypeScript | 講師画面・保護者画面・APIを1デプロイで完結 |
| スタイル | Tailwind CSS v4 | 保護者画面のスマホ最適化を高速構築 |
| ORM | Drizzle ORM + drizzle-kit | スキーマがTSコード。軽量、Vercel無料枠と相性良 |
| DB | PostgreSQL (Neon無料枠) | `@neondatabase/serverless` ドライバ |
| 認証(講師) | Auth.js v5 Credentials + bcryptjs + JWTセッション | メール+パスワード。DBアダプタ不要で最小構成 |
| 認証(保護者) | アカウントレス。家族単位の不透明トークン(DBにsha256保存)を `/p/[token]` に埋めた招待リンク | 再発行で失効可能 |
| 検証 | Zod + Server Actions | フォームはServer Actions中心 |
| メール | Resend(`EMAIL_DRY_RUN=true` でconsole出力) | 開発中はAPIキー不要 |
| テスト | Vitest(domain純関数)+ seedによる手動確認 | PlaywrightはPhase 2 |
| デプロイ | Vercel Hobby + pnpm | ランニングコスト0円スタート |

```
src/
  app/
    (auth)/login, signup
    (teacher)/dashboard, calendar, students, lessons, reschedules, invoices, settings  ← layout.tsxでセッションガード
    p/[token]/...        ← 保護者ポータル(layout.tsxでトークン検証、不正は404)
    api/auth/[...nextauth]/route.ts
  lib/
    db/schema.ts, index.ts
    domain/lessons.ts, reschedule.ts, invoice.ts   ← 純関数(テスト対象)
    actions/             ← Server Actions(zod検証+domain呼び出し)
    auth.ts, email.ts, token.ts
scripts/seed.ts  /  drizzle/  /  tests/domain/*.test.ts
```

環境変数: `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`(任意), `EMAIL_DRY_RUN`, `APP_BASE_URL`。`.env.example` をM1で作成。

### 4.2 データモデル(全テーブル)
```sql
teachers       (id uuid PK, email unique, password_hash, name, created_at)
classrooms     (id PK, teacher_id FK unique, name, default_lesson_minutes int default 30,
                sibling_discount_yen int default 0, created_at)
                -- MVPは講師1:教室1。別テーブル化がPhase2(複数教室)への布石
families       (id PK, classroom_id FK, parent_name, email, phone null,
                access_token_hash unique,  -- sha256(token)。生トークンは発行時のみ表示
                token_expires_at null, created_at)
students       (id PK, family_id FK, name, monthly_fee_yen int default 0, memo,
                status default 'active')   -- 兄弟リンク = 同一family_id
lesson_slots   (id PK, classroom_id FK, weekday int /*0=日..6=土*/, start_time, duration_min,
                active bool default true)  -- 枠定義。capacity=1固定(個人レッスン前提、カラム無し)
slot_assignments (id PK, slot_id FK, student_id FK, start_date, end_date null)
                -- 固定枠の割当履歴(曜日変更対応)。同一slotの期間重複はアプリ層で禁止
closures       (id PK, classroom_id FK, date, reason, unique(classroom_id, date))  -- 休講日
lessons        (id PK, classroom_id FK, student_id FK, slot_id FK null /*null=振替単発*/,
                date, start_time, duration_min,
                status default 'scheduled',  -- scheduled|completed|absent|cancelled
                origin_lesson_id null,       -- 振替レッスン→元の欠席レッスン
                unique(slot_id, student_id, date))  -- 遅延生成の冪等性担保
lesson_notes   (id PK, lesson_id FK unique, content, homework, message,
                published_at null)           -- non-nullのときのみ保護者に表示
reschedule_requests (id PK, lesson_id FK unique, student_id FK, requested_by /*parent|teacher*/,
                reason null, status,  -- pending_choice|confirmed|no_makeup|cancelled|expired
                makeup_lesson_id null FK, expires_at null, created_at, resolved_at null)
reschedule_candidates (id PK, request_id FK, slot_id FK, date,
                unique(request_id, slot_id, date))  -- 講師が候補を絞る場合のみ使用
invoices       (id PK, family_id FK, year_month /*'2026-07'*/,
                status default 'draft',  -- draft|issued|paid|void
                total_yen int, due_date null, issued_at null, paid_at null, memo,
                unique(family_id, year_month))
invoice_items  (id PK, invoice_id FK, student_id null,
                item_type,  -- tuition|material|event|discount|adjustment
                label, amount_yen int /*discountは負数*/, sort_order)
email_logs     (id PK, to_email, subject, body, status, created_at)
```

**レッスン実体の遅延生成(cron不要)** — `ensureLessonsForRange(classroomId, from, to)`:
期間内の各日×全active slotで、weekday一致・closures非該当・slot_assignments有効期間内の生徒がいる組を列挙し、`INSERT ... ON CONFLICT (slot_id, student_id, date) DO NOTHING`。absent/cancelled済みの行はunique制約で再生成されない。呼び出しは講師カレンダー表示時・保護者ポータル表示時・振替候補計算時(今日〜6週先)。

### 4.3 画面一覧
**講師側**(セッション必須): `/dashboard`(今日の予定・対応待ち振替・未納サマリ)、`/calendar?week=`(週間グリッド、状態色分け)、`/students` 一式(招待リンク発行/再発行ボタン含む)、`/settings/slots`(枠CRUD)、`/settings`(教室名・兄弟割引・休講日)、`/lessons/[id]`(状態変更・ノート記入)、`/reschedules` 一式、`/invoices?month=` 一式。

**保護者側**(`/p/[token]`、スマホ最適化): ホーム(次回レッスン・直近ノート・未納有無)、予定一覧(欠席連絡ボタン)、欠席申請→振替候補選択画面、ノート一覧/詳細、請求一覧(閲覧のみ)。

### 4.4 振替フローの状態機械(本MVPの心臓部)
```
[なし] ─①保護者欠席申請/講師起票→ pending_choice
pending_choice ─②候補選択(保護者 or 講師代行)→ confirmed
pending_choice ─③振替なし選択→ no_makeup
pending_choice ─⑤取り下げ→ cancelled   (④expires_at超過→expired はMVPでは警告表示のみ)
```
- ①: 元lesson → `absent`。候補は保存せず動的計算(画面表示時点の空き枠)。reschedule_candidatesは講師が絞りたい場合のみ。講師へ通知
- ②: **トランザクション内で** `SELECT ... FOR UPDATE`(対象slot行)→ 当該(slot,date)にactiveなlessonが無いことを再確認 → 振替lesson作成(`origin_lesson_id`=元lesson)→ request更新。両者へ通知。**二重予約はここで防止**
- ⑤: 元lessonを `scheduled` に復帰
- 候補計算 `computeMakeupCandidates`: 明日〜6週先で、active slot×日付のうちscheduled/completedなlessonが無く、休講日でない組(absentで空いた枠は他生徒の振替に使える)

### 4.5 実装マイルストーン(各ステップ単独で動作確認可能)
- **M1 基盤+認証+教室設定**: next-app初期化、Drizzle+Neon、全テーブル一括マイグレーション(手戻り防止)、Auth.js signup/login/logout、`/settings`。検証: サインアップ→再ログイン→設定保存
- **M2 生徒・枠・レッスン生成・カレンダー**: 枠CRUD、生徒/家族CRUD、`ensureLessonsForRange`、休講日管理、週間カレンダー、`scripts/seed.ts`(講師1・枠8・家族5(兄弟1組)・生徒6・休講1件)。検証: 正しい曜日時刻で表示、休講日は非生成、週送りで重複なし+Vitest
- **M3 保護者ポータル+レッスンノート**: トークン発行(`crypto.randomBytes(32)`、DBはsha256)、`/p/[token]` 一式、ノート記入(下書き/公開、公開でlesson=completed)。検証: シークレットウィンドウで兄弟分の予定閲覧、不正トークン404、再発行で旧リンク無効
- **M4 振替フロー**: 候補計算・状態遷移の純関数、保護者の欠席申請→候補選択→確定、講師の振替管理画面、カレンダーに振替バッジ。検証: Vitest(全遷移パス・不正遷移拒否・埋まり枠/休講日の除外)+ **2ブラウザで同一候補を同時確定し片方が失敗することを確認**
- **M5 月謝・請求**: `generateDraftInvoice`(月謝行+兄弟2人以上で割引行自動)、月次一括ドラフト生成(冪等)、行編集→発行→入金記録、保護者閲覧。検証: Vitest(割引・合計)+再生成で重複しない
- **M6 通知+休講連動+仕上げ**: Resendメール(欠席受付→講師、振替確定→両者、請求発行→保護者、招待リンク)、休講登録時の生成済みレッスンcancelled化+振替起票、ダッシュボード完成、README、Vercelデプロイ

## 5. 検証方法
- **seed**: `pnpm db:seed`(冪等: truncate→再投入)。マイルストーンごとに拡充
- **Vitest**: domain純関数のみ対象(DBモック不要の設計)— レッスン展開、振替候補、状態遷移、請求生成、トークン照合
- **手動確認**: 講師=通常ウィンドウ / 保護者=シークレットウィンドウの2窓運用。各マイルストーン末尾の手順をREADMEに蓄積
- **最終**: Vercelデプロイ後、サインアップ→生徒登録→招待→欠席→振替確定→ノート公開→請求発行→入金記録の全フロー通し確認

## 6. Phase 2への布石(実装済み構造で対応可能)
- Stripe決済: invoicesに`stripe_payment_intent_id`追加+status`processing`追加のみ
- 複数教室: teachers↔classroomsは既に別テーブル。クエリは最初からclassroom_idスコープで書く規約
- LINE連携: 通知は`email.ts`(将来`notify.ts`に抽象化)1モジュールに集約
- グループレッスン: lesson_slotsにcapacity追加+空き判定変更のみ

## 出典
- [保科陽子ピアノ経営塾: ピアノの先生のお金の悩み](https://coachinglesson.com/piano/pianonayami/)
- [日経メッセFCショー: 音楽教室市場](https://messe.nikkei.co.jp/fc/column/market/132894.html)
- [アスピック: スクール管理システム比較](https://www.aspicjapan.org/asu/article/62356)
- [OREND: ピアノ&音楽教室の管理アプリ比較15選](https://orend.jp/mag/a0306)
- [会費ペイブログ: ピアノ教室の月謝集金システム](https://blog.kaihipay.jp/piano_esson_monthly/)
- [wagaco公式](https://wagaco-ai.com/)
