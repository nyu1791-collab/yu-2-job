/**
 * Apple/Google IDトークンの検証(PLAN.md §4.5 M3)。
 *
 * - Apple: `https://appleid.apple.com/auth/keys` のJWKSで検証(issuer: `https://appleid.apple.com`)
 * - Google: `https://www.googleapis.com/oauth2/v3/certs` のJWKSで検証
 *   (issuer: `https://accounts.google.com` または `accounts.google.com`)
 *
 * `jose` の `createRemoteJWKSet` を使うが、テストでは外部ネットワークに出られないため、
 * JWKSの取得元(`JWTVerifyGetKey`)を注入可能にしている(`getJwks` オプション)。
 * 本番では未指定時に `createRemoteJWKSet` を使う。
 */

import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
export const APPLE_ISSUER = "https://appleid.apple.com";

export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
export const GOOGLE_ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export class IdTokenVerificationError extends Error {
  constructor(provider: string, cause?: unknown) {
    super(`${provider} IDトークンの検証に失敗しました。`);
    this.name = "IdTokenVerificationError";
    this.cause = cause;
  }
}

export class MissingAudienceError extends Error {
  constructor(envVar: string) {
    super(`${envVar} が設定されていません。サーバ環境変数を確認してください。`);
    this.name = "MissingAudienceError";
  }
}

export interface VerifiedIdentity {
  /** プロバイダ側のユーザーID(sub) */
  sub: string;
  email: string | null;
}

let appleJwksCache: JWTVerifyGetKey | null = null;
let googleJwksCache: JWTVerifyGetKey | null = null;

/** テスト用: リモートJWKSのキャッシュをリセットする。 */
export function _resetJwksCacheForTest(): void {
  appleJwksCache = null;
  googleJwksCache = null;
}

/**
 * Apple `identityToken` を検証し、sub/emailを取り出す。
 *
 * @param getJwks テスト用: JWKS取得元を注入する(未指定時は `appleid.apple.com` のリモートJWKS)。
 */
export async function verifyAppleIdentityToken(
  identityToken: string,
  getJwks?: JWTVerifyGetKey,
): Promise<VerifiedIdentity> {
  const audience = process.env["APPLE_CLIENT_ID"];
  if (!audience) {
    throw new MissingAudienceError("APPLE_CLIENT_ID");
  }

  const jwks = getJwks ?? getAppleJwks();

  try {
    const { payload } = await jwtVerify(identityToken, jwks, {
      issuer: APPLE_ISSUER,
      audience,
    });
    if (typeof payload.sub !== "string") {
      throw new Error("sub claim missing");
    }
    return {
      sub: payload.sub,
      email: typeof payload["email"] === "string" ? payload["email"] : null,
    };
  } catch (err) {
    throw new IdTokenVerificationError("Apple", err);
  }
}

/**
 * Google `idToken` を検証し、sub/emailを取り出す。
 *
 * @param getJwks テスト用: JWKS取得元を注入する(未指定時は `googleapis.com` のリモートJWKS)。
 */
export async function verifyGoogleIdToken(
  idToken: string,
  getJwks?: JWTVerifyGetKey,
): Promise<VerifiedIdentity> {
  const audience = process.env["GOOGLE_CLIENT_ID"];
  if (!audience) {
    throw new MissingAudienceError("GOOGLE_CLIENT_ID");
  }

  const jwks = getJwks ?? getGoogleJwks();

  try {
    const { payload } = await jwtVerify(idToken, jwks, {
      issuer: GOOGLE_ISSUERS,
      audience,
    });
    if (typeof payload.sub !== "string") {
      throw new Error("sub claim missing");
    }
    return {
      sub: payload.sub,
      email: typeof payload["email"] === "string" ? payload["email"] : null,
    };
  } catch (err) {
    throw new IdTokenVerificationError("Google", err);
  }
}

function getAppleJwks(): JWTVerifyGetKey {
  if (!appleJwksCache) {
    appleJwksCache = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  }
  return appleJwksCache;
}

function getGoogleJwks(): JWTVerifyGetKey {
  if (!googleJwksCache) {
    googleJwksCache = createRemoteJWKSet(new URL(GOOGLE_JWKS_URL));
  }
  return googleJwksCache;
}
