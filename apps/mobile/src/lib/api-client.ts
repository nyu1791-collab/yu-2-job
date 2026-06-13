import type { ActivityLevel, Analysis, CorrectedAnalysis, GoalType, Sex } from "@pashacaro/shared";
import {
  clearAuthTokens,
  getAuthState,
  updateTokensAfterRefresh,
} from "./auth-store";

/**
 * apps/api への簡易APIクライアント。
 *
 * 環境変数:
 *   EXPO_PUBLIC_API_URL   - 例: http://localhost:8787
 *   EXPO_PUBLIC_DEV_TOKEN - apps/api の DEV_TOKEN と同じ値(devビルドの「devトークンでスキップ」用)
 *
 * M3: Apple/Googleサインイン後はauth-storeに保存されたJWTを使用する(authedFetch)。
 * EXPO_PUBLIC_DEV_TOKEN はsign-in.tsxの「devトークンでスキップ」ボタンから
 * setAuthTokens({accessToken: devToken, ...}) のように使われ、
 * requireAuth() がdevトークンとして認識して通す。
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

export function getApiBaseUrl(): string {
  const url = process.env["EXPO_PUBLIC_API_URL"];
  if (!url) {
    throw new Error(
      "EXPO_PUBLIC_API_URL が設定されていません。.env を確認してください(例: http://localhost:8787)。",
    );
  }
  return url.replace(/\/$/, "");
}

/** devビルド用の固定devトークン(EXPO_PUBLIC_DEV_TOKEN)。サインイン画面の「devトークンでスキップ」用。 */
export function getDevToken(): string | undefined {
  return process.env["EXPO_PUBLIC_DEV_TOKEN"];
}

/**
 * JWT付きでAPIへリクエストする。401が返った場合は `/v1/auth/refresh` で
 * アクセストークンを再発行し、1回だけリトライする。
 *
 * - devトークン(EXPO_PUBLIC_DEV_TOKENで取得したアクセストークン)はrefreshTokenを持たないため、
 *   401時のリフレッシュは行わずそのまま401を返す。
 * - リフレッシュにも失敗した場合は認証情報をクリアし、401を返す
 *   (呼び出し側でルートガードがサインイン画面へ誘導する)。
 */
export async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const baseUrl = getApiBaseUrl();
  const auth = getAuthState();

  if (!auth.accessToken) {
    throw new Error("未サインインです。サインインしてから実行してください。");
  }

  const doFetch = (accessToken: string) =>
    fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        Authorization: `Bearer ${accessToken}`,
      },
    });

  let res = await doFetch(auth.accessToken);

  if (res.status === 401 && auth.refreshToken) {
    const refreshed = await refreshAccessToken(auth.refreshToken);
    if (refreshed) {
      res = await doFetch(refreshed.accessToken);
    } else {
      await clearAuthTokens();
    }
  }

  return res;
}

export interface RefreshedTokens {
  accessToken: string;
  refreshToken: string;
}

/** POST /v1/auth/refresh: ローテーションされた新トークンを返す。失敗時はnull。 */
export async function refreshAccessToken(refreshToken: string): Promise<RefreshedTokens | null> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/v1/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as RefreshedTokens;
  await updateTokensAfterRefresh(body);
  return body;
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
  const res = await authedFetch("/v1/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
  const res = await authedFetch("/v1/analyze/text", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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

// ---------------------------------------------------------------------------
// 認証 (PLAN.md §4.5 M3)
// ---------------------------------------------------------------------------

export interface AuthSuccess {
  ok: true;
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string | null; displayName: string | null };
}

export interface AuthFailure {
  ok: false;
  status: number;
  error_kind: string;
  message: string;
}

export type AuthResponse = AuthSuccess | AuthFailure;

async function parseAuthResponse(res: Response): Promise<AuthResponse> {
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    return { ok: true, accessToken: body.accessToken, refreshToken: body.refreshToken, user: body.user };
  }
  return {
    ok: false,
    status: res.status,
    error_kind: body.error_kind ?? "error",
    message: body.message ?? "不明なエラーが発生しました。",
  };
}

/** POST /v1/auth/apple: Apple `identityToken` をサーバでJWKS検証し、JWTを発行する。 */
export async function signInWithApple(identityToken: string): Promise<AuthResponse> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/v1/auth/apple`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identityToken }),
  });
  return parseAuthResponse(res);
}

/** POST /v1/auth/google: Google `idToken` をサーバでJWKS検証し、JWTを発行する。 */
export async function signInWithGoogle(idToken: string): Promise<AuthResponse> {
  const baseUrl = getApiBaseUrl();
  const res = await fetch(`${baseUrl}/v1/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  return parseAuthResponse(res);
}

// ---------------------------------------------------------------------------
// プロフィール・目標 (PLAN.md §4.3 / §4.5 M3)
// ---------------------------------------------------------------------------

export interface MeProfile {
  id: string;
  email: string | null;
  displayName: string | null;
  createdAt: string;
}

/** GET /v1/me */
export async function getMe(): Promise<MeProfile | null> {
  const res = await authedFetch("/v1/me");
  if (!res.ok) {
    return null;
  }
  return (await res.json()) as MeProfile;
}

export interface GoalRow {
  id: number;
  userId: string;
  goalType: GoalType;
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activityLevel: ActivityLevel;
  targetKcal: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbsG: number;
  effectiveFrom: string;
  createdAt: string;
}

/** GET /v1/me/goal: 現在有効な目標を返す。未設定(404)の場合はnull。 */
export async function getMyGoal(): Promise<GoalRow | null> {
  const res = await authedFetch("/v1/me/goal");
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`GET /v1/me/goal failed: ${res.status}`);
  }
  const body = (await res.json()) as { goal: GoalRow };
  return body.goal;
}

export interface UpdateGoalInput {
  goalType: GoalType;
  weightKg: number;
  heightCm: number;
  age: number;
  sex: Sex;
  activityLevel: ActivityLevel;
  /**
   * オンボーディングの目標カロリー微調整(±50kcal)で変更した値があれば指定する。
   * サーバ側で `recalculatePfcForKcal` によりP/F/Cを再計算して保存する。
   * 未指定時はgoal-calcの自動計算値(targetKcal)をそのまま使用する。
   */
  targetKcalOverride?: number;
}

/** PUT /v1/me/goal: sharedのgoal-calcと同じ計算をサーバ側で行い、新しいgoals行をinsertする。 */
export async function updateMyGoal(input: UpdateGoalInput): Promise<GoalRow> {
  const res = await authedFetch("/v1/me/goal", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`PUT /v1/me/goal failed: ${res.status}`);
  }
  const body = (await res.json()) as { goal: GoalRow };
  return body.goal;
}
