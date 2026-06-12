import type { Analysis, CorrectedAnalysis } from "@pashacaro/shared";

/**
 * apps/api への簡易APIクライアント(M1: 固定devトークン認証)。
 *
 * 環境変数:
 *   EXPO_PUBLIC_API_URL   - 例: http://localhost:8787
 *   EXPO_PUBLIC_DEV_TOKEN - apps/api の DEV_TOKEN と同じ値
 *
 * これらはあくまでM1の開発用。M3でApple/Googleサインイン+JWTに置き換える。
 */

export type AnalyzeErrorKind =
  | "not_food"
  | "parse_failed"
  | "image_too_large"
  | "upstream_unavailable"
  | "rate_limited"
  | "invalid_request"
  | "config_error"
  | "http_error"
  | "error";

export interface AnalyzeUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface AnalyzeSuccess {
  ok: true;
  analysis: CorrectedAnalysis | Analysis;
  escalated: boolean;
  flagged: boolean;
  model: string;
  usage: AnalyzeUsage;
  matched_product_id: null;
}

export interface AnalyzeFailure {
  ok: false;
  status: number;
  error_kind: AnalyzeErrorKind;
  message: string;
  /** not_food の場合のみ、サーバから返却された解析結果(空dishes)を保持 */
  analysis?: Analysis;
}

export type AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure;

function getApiBaseUrl(): string {
  const url = process.env["EXPO_PUBLIC_API_URL"];
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_API_URL が設定されていません。.env を確認してください(例: http://localhost:8787)。",
    );
  }
  return url.replace(/\/$/, "");
}

function getDevToken(): string {
  const token = process.env["EXPO_PUBLIC_DEV_TOKEN"];
  if (!token) {
    throw new Error(
      "EXPO_PUBLIC_DEV_TOKEN が設定されていません。.env を確認してください。",
    );
  }
  return token;
}

async function parseResponse(res: Response): Promise<AnalyzeResponse> {
  const body = await res.json().catch(() => ({}));

  if (res.ok) {
    return {
      ok: true,
      analysis: body.analysis,
      escalated: Boolean(body.escalated),
      flagged: Boolean(body.flagged),
      model: body.model ?? "unknown",
      usage: body.usage ?? {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
      matched_product_id: null,
    };
  }

  // not_food は 200 で返るためここには来ないが、念のためハンドリング
  return {
    ok: false,
    status: res.status,
    error_kind: (body.error_kind as AnalyzeErrorKind) ?? "error",
    message: body.message ?? "不明なエラーが発生しました。",
    analysis: body.analysis,
  };
}

export interface AnalyzePhotoInput {
  imageBase64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  takenAt?: string;
  userNote?: string;
}

/** POST /v1/analyze */
export async function analyzePhoto(input: AnalyzePhotoInput): Promise<AnalyzeResponse> {
  const baseUrl = getApiBaseUrl();
  const token = getDevToken();

  const res = await fetch(`${baseUrl}/v1/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseResponse(res);

  // is_food: false は 200 + error_kind: "not_food" として返るため、
  // 上のparseResponseでは ok:true になっている。ここで判定して変換する。
  if (parsed.ok && parsed.analysis && (parsed.analysis as Analysis).is_food === false) {
    return {
      ok: false,
      status: 200,
      error_kind: "not_food",
      message: "食事が写っていないようです。",
      analysis: parsed.analysis as Analysis,
    };
  }

  return parsed;
}

export interface AnalyzeTextInput {
  text: string;
  takenAt?: string;
}

/** POST /v1/analyze/text */
export async function analyzeText(input: AnalyzeTextInput): Promise<AnalyzeResponse> {
  const baseUrl = getApiBaseUrl();
  const token = getDevToken();

  const res = await fetch(`${baseUrl}/v1/analyze/text`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  const parsed = await parseResponse(res);

  if (parsed.ok && parsed.analysis && (parsed.analysis as Analysis).is_food === false) {
    return {
      ok: false,
      status: 200,
      error_kind: "not_food",
      message: "食事が写っていないようです。",
      analysis: parsed.analysis as Analysis,
    };
  }

  return parsed;
}
