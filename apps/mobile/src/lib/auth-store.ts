import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";
import { getEntitlement, type EntitlementInfo } from "./api-client";

/**
 * 認証トークンの保持・永続化(M3) + entitlement(課金状態)キャッシュ(M5)。
 *
 * - アクセスJWT・リフレッシュトークンは expo-secure-store に保存する。
 * - APIクライアント(api-client.ts)はこのストアからアクセストークンを取得し、
 *   401時に refreshAccessToken() で自動リトライする。
 * - 起動時に loadAuthFromStorage() で復元する(_layout.tsx のルートガードから呼ぶ)。
 * - entitlement(エンタイトルメント)はサーバ側の `GET /v1/me/entitlement` から取得し、
 *   メモリ上にのみ保持する(永続化はしない)。サインイン直後・購入/復元直後・
 *   起動時に `fetchEntitlement()` を呼んで最新化する。
 *   `_layout.tsx` のルートガードはこの値を見てpaywallへの遷移を判定する。
 */

const ACCESS_TOKEN_KEY = "pashacaro.accessToken";
const REFRESH_TOKEN_KEY = "pashacaro.refreshToken";
const USER_ID_KEY = "pashacaro.userId";

export interface AuthState {
  /** 起動時の復元処理が完了したか */
  isLoading: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  userId: string | null;
  /**
   * entitlement取得状況。
   * - undefined: まだ取得していない(=ガード判定を保留する)
   * - null: 取得を試みたが失敗した(エラー時。ガードはブロックしない)
   * - EntitlementInfo: 取得成功
   */
  entitlement: EntitlementInfo | null | undefined;
}

let state: AuthState = {
  isLoading: true,
  accessToken: null,
  refreshToken: null,
  userId: null,
  entitlement: undefined,
};

const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAuthState(): AuthState {
  return state;
}

/** Reactコンポーネントから現在の認証状態を購読するためのフック */
export function useAuthState(): AuthState {
  return useSyncExternalStore(subscribe, getAuthState, getAuthState);
}

/** 起動時に expo-secure-store からトークンを復元する。 */
export async function loadAuthFromStorage(): Promise<void> {
  const [accessToken, refreshToken, userId] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.getItemAsync(USER_ID_KEY),
  ]);

  state = {
    isLoading: false,
    accessToken,
    refreshToken,
    userId,
    entitlement: undefined,
  };
  emit();

  if (accessToken) {
    await fetchEntitlement();
  }
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  userId: string;
}

/** サインイン成功時にトークンを保存する。 */
export async function setAuthTokens(tokens: AuthTokens): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, tokens.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, tokens.refreshToken),
    SecureStore.setItemAsync(USER_ID_KEY, tokens.userId),
  ]);
  state = {
    isLoading: false,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    userId: tokens.userId,
    entitlement: undefined,
  };
  emit();
}

/** リフレッシュローテーション後にアクセス/リフレッシュトークンのみ更新する。 */
export async function updateTokensAfterRefresh(input: {
  accessToken: string;
  refreshToken: string;
}): Promise<void> {
  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, input.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, input.refreshToken),
  ]);
  state = {
    ...state,
    isLoading: false,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken,
  };
  emit();
}

/** サインアウト: トークンを削除する。 */
export async function clearAuthTokens(): Promise<void> {
  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
    SecureStore.deleteItemAsync(USER_ID_KEY),
  ]);
  state = { isLoading: false, accessToken: null, refreshToken: null, userId: null, entitlement: undefined };
  emit();
}

/** テスト・開発用にストアをリセットする(永続化はしない)。 */
export function _resetAuthStoreForTest(): void {
  state = { isLoading: true, accessToken: null, refreshToken: null, userId: null, entitlement: undefined };
  emit();
}

export function isSignedIn(): boolean {
  return state.accessToken !== null;
}

/**
 * `GET /v1/me/entitlement` を取得し、ストアに反映する。
 *
 * - 未サインイン(accessTokenなし)の場合は何もしない。
 * - 取得失敗時は `entitlement: null` とする(ガードをブロックしないための値。
 *   ネットワークエラー等で誤ってpaywallに飛ばし続けることを避ける)。
 * - サインイン直後・購入/復元直後・起動時(loadAuthFromStorage)に呼ぶ想定。
 */
export async function fetchEntitlement(): Promise<EntitlementInfo | null> {
  if (!state.accessToken) {
    return null;
  }
  try {
    const entitlement = await getEntitlement();
    state = { ...state, entitlement };
    emit();
    return entitlement;
  } catch (err) {
    console.error("entitlementの取得に失敗しました:", err);
    state = { ...state, entitlement: null };
    emit();
    return null;
  }
}
