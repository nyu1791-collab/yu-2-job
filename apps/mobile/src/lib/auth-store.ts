import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";

/**
 * 認証トークンの保持・永続化(M3)。
 *
 * - アクセスJWT・リフレッシュトークンは expo-secure-store に保存する。
 * - APIクライアント(api-client.ts)はこのストアからアクセストークンを取得し、
 *   401時に refreshAccessToken() で自動リトライする。
 * - 起動時に loadAuthFromStorage() で復元する(_layout.tsx のルートガードから呼ぶ)。
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
}

let state: AuthState = {
  isLoading: true,
  accessToken: null,
  refreshToken: null,
  userId: null,
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
  };
  emit();
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
  state = { isLoading: false, accessToken: null, refreshToken: null, userId: null };
  emit();
}

/** テスト・開発用にストアをリセットする(永続化はしない)。 */
export function _resetAuthStoreForTest(): void {
  state = { isLoading: true, accessToken: null, refreshToken: null, userId: null };
  emit();
}

export function isSignedIn(): boolean {
  return state.accessToken !== null;
}
