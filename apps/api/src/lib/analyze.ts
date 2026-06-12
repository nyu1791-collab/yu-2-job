import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  AnalysisSchema,
  evaluateEscalation,
  SYSTEM_PROMPT,
  type Analysis,
} from "@pashacaro/shared";

/**
 * AI解析パイプライン(PLAN.md §4.2)。
 *
 * - claude-haiku-4-5 / claude-sonnet-4-6 を文字列リテラルで指定(日付サフィックス禁止)
 * - messages.parse + zodOutputFormat + prompt caching(systemブロックに cache_control: ephemeral)
 * - Haiku が parsed_output === null の場合は1回だけHaikuでリトライ、再失敗ならSonnetへエスカレーション
 * - 整合性チェック等(escalation.ts)に基づき必要ならSonnetで再解析
 */

export const HAIKU_MODEL = "claude-haiku-4-5";
export const SONNET_MODEL = "claude-sonnet-4-6";

export type ModelName = typeof HAIKU_MODEL | typeof SONNET_MODEL;

export const MAX_IMAGE_BASE64_BYTES = 2 * 1024 * 1024; // 2MB

export class MissingApiKeyError extends Error {
  constructor() {
    super(
      "ANTHROPIC_API_KEY が設定されていません。環境変数を設定してサーバを再起動してください。",
    );
    this.name = "MissingApiKeyError";
  }
}

export class ImageTooLargeError extends Error {
  constructor() {
    super("画像データが大きすぎます(base64で2MBを超えています)。");
    this.name = "ImageTooLargeError";
  }
}

let cachedClient: Anthropic | null = null;

/**
 * Anthropicクライアントを取得する。
 * ANTHROPIC_API_KEY が無い場合は呼び出し時に MissingApiKeyError を投げる
 * (起動自体は失敗させない)。
 */
function getClient(): Anthropic {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    throw new MissingApiKeyError();
  }
  if (!cachedClient) {
    cachedClient = new Anthropic({ apiKey });
  }
  return cachedClient;
}

/** テスト用: キャッシュされたクライアントをリセットする */
export function _resetClientForTest(): void {
  cachedClient = null;
}

export interface CallModelResult {
  parsed: Analysis | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number | null;
    cache_creation_input_tokens: number | null;
  };
}

export interface CallModelOptions {
  /** "image/jpeg" | "image/png" など */
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  /** base64エンコードされた画像データ。テキストのみの場合は省略 */
  imageBase64?: string;
  /** 撮影時刻・ユーザー補足など、可変要素はすべてここに含める(systemには絶対入れない) */
  context: string;
}

/**
 * 単一モデルへの解析リクエスト。
 *
 * systemブロックは静的なSYSTEM_PROMPT 1本のみで cache_control: ephemeral を付与する。
 * 可変要素(撮影時刻・ユーザー補足等)は必ず messages 側(context)に含める。
 */
export async function callModel(
  model: ModelName,
  options: CallModelOptions,
): Promise<CallModelResult> {
  const client = getClient();
  const { mediaType, imageBase64, context } = options;

  const content: Anthropic.Messages.ContentBlockParam[] = [];
  if (imageBase64) {
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType, data: imageBase64 },
    });
  }
  content.push({ type: "text", text: context });

  const response = await client.messages.parse({
    model,
    max_tokens: 2048,
    system: [
      { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content }],
    output_config: { format: zodOutputFormat(AnalysisSchema) },
  });

  return {
    parsed: response.parsed_output,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? null,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? null,
    },
  };
}

export interface AnalyzePipelineResult {
  /** 最終的なパース結果。両モデルで失敗した場合はnull */
  parsed: Analysis | null;
  /** 最終的に結果を確定したモデル */
  finalModel: ModelName;
  /** Sonnetへエスカレーションしたか */
  escalated: boolean;
  /** エスカレーション理由(複数モデルコールの履歴) */
  escalationReasons: string[];
  /** Sonnetでもエスカレーション条件を満たした場合(結果は採用するがflagged=true) */
  flagged: boolean;
  /** 各モデルコールのusage合計 */
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
  /** モデルコール回数(リトライ・エスカレーション含む) */
  callCount: number;
}

function emptyUsage(): AnalyzePipelineResult["usage"] {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };
}

function addUsage(
  total: AnalyzePipelineResult["usage"],
  usage: CallModelResult["usage"],
): void {
  total.input_tokens += usage.input_tokens;
  total.output_tokens += usage.output_tokens;
  total.cache_read_input_tokens += usage.cache_read_input_tokens ?? 0;
  total.cache_creation_input_tokens += usage.cache_creation_input_tokens ?? 0;
}

/**
 * Haiku→Sonnetエスカレーションを含む解析パイプライン全体。
 *
 * 1. Haikuで解析
 * 2. parsed===null なら Haikuで1回だけリトライ
 * 3. evaluateEscalation の結果に従い、必要ならSonnetで同一プロンプト・同一画像で再解析
 * 4. Sonnetでも条件を満たす場合は結果採用 + flagged=true
 */
export async function runAnalysisPipeline(
  options: CallModelOptions,
): Promise<AnalyzePipelineResult> {
  const usage = emptyUsage();
  const escalationReasons: string[] = [];
  let callCount = 0;

  // 1. Haikuで解析
  let haikuResult = await callModel(HAIKU_MODEL, options);
  callCount += 1;
  addUsage(usage, haikuResult.usage);

  // 2. parsed===null なら Haikuで1回リトライ
  let alreadyRetried = false;
  if (haikuResult.parsed === null) {
    haikuResult = await callModel(HAIKU_MODEL, options);
    callCount += 1;
    addUsage(usage, haikuResult.usage);
    alreadyRetried = true;
  }

  const haikuEscalation = evaluateEscalation({
    parsed: haikuResult.parsed,
    alreadyRetried,
  });

  if (!haikuEscalation.shouldEscalate) {
    return {
      parsed: haikuResult.parsed,
      finalModel: HAIKU_MODEL,
      escalated: false,
      escalationReasons: [],
      flagged: false,
      usage,
      callCount,
    };
  }

  escalationReasons.push(...haikuEscalation.reasons);

  // 3. Sonnetへエスカレーション(同一プロンプト・同一画像)
  const sonnetResult = await callModel(SONNET_MODEL, options);
  callCount += 1;
  addUsage(usage, sonnetResult.usage);

  // 4. Sonnetでも条件を満たすか再評価。parsed===nullの場合はリトライ済みとみなす
  // (Sonnetへのエスカレーション自体が「再解析」のため)。
  const sonnetEscalation = evaluateEscalation({
    parsed: sonnetResult.parsed,
    alreadyRetried: true,
  });

  if (sonnetEscalation.shouldEscalate) {
    escalationReasons.push(...sonnetEscalation.reasons);
  }

  return {
    parsed: sonnetResult.parsed,
    finalModel: SONNET_MODEL,
    escalated: true,
    escalationReasons,
    // Sonnetでも条件を満たす場合は結果採用+flagged=true(parsed===nullの場合はparse_failed扱いなのでflagged対象外)
    flagged: sonnetResult.parsed !== null && sonnetEscalation.shouldEscalate,
    usage,
    callCount,
  };
}
