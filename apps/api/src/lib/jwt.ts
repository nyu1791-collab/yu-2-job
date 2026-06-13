/**
 * 自前アクセスJWT + リフレッシュトークン(PLAN.md §4.5 M3)。
 *
 * - アクセスJWT: HS256、有効期限1時間、`JWT_SECRET` で自前署名。
 *   payload: { sub: userId, type: "access" }
 * - リフレッシュトークン: ランダム32byte(hex)。DBには sha256ハッシュを保存し、平文はクライアントのみが保持する。
 *   有効期限30日。`/v1/auth/refresh` でローテーション(旧トークン無効化+新規発行、再利用は拒否)。
 */

import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1h
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30days

export interface AccessTokenPayload {
  sub: string;
  type: "access";
}

/** `JWT_SECRET` 環境変数を取得する。未設定時はエラー。 */
export function getJwtSecret(): Uint8Array {
  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    throw new MissingJwtSecretError();
  }
  return new TextEncoder().encode(secret);
}

export class MissingJwtSecretError extends Error {
  constructor() {
    super("JWT_SECRET が設定されていません。サーバ環境変数を確認してください。");
    this.name = "MissingJwtSecretError";
  }
}

/** アクセスJWT(1h、HS256)を発行する。 */
export async function signAccessToken(userId: string): Promise<string> {
  const secret = getJwtSecret();
  return await new SignJWT({ type: "access" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_SECONDS}s`)
    .sign(secret);
}

/**
 * アクセスJWTを検証し、userIdを返す。
 * 検証失敗(署名不一致・期限切れ・type不一致)時は null を返す。
 */
export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const secret = getJwtSecret();
    const { payload } = await jwtVerify(token, secret, { algorithms: ["HS256"] });
    if (payload["type"] !== "access" || typeof payload.sub !== "string") {
      return null;
    }
    return payload.sub;
  } catch {
    return null;
  }
}

export interface IssuedRefreshToken {
  /** クライアントに返す平文トークン(hex 64文字 = 32byte) */
  token: string;
  /** DBに保存するsha256ハッシュ(hex) */
  tokenHash: string;
  expiresAt: Date;
}

/** 新しいリフレッシュトークン(ランダム32byte)を生成する。 */
export function issueRefreshToken(now: Date = new Date()): IssuedRefreshToken {
  const token = randomBytes(32).toString("hex");
  return {
    token,
    tokenHash: hashRefreshToken(token),
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
  };
}

/** リフレッシュトークン(平文)をsha256ハッシュ(hex)に変換する。 */
export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
