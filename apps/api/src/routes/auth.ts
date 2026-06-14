/**
 * 認証API(PLAN.md §4.5 M3)。
 *
 * - POST /v1/auth/apple  {identityToken} -> JWKS検証 -> users upsert(apple_sub) -> {accessToken, refreshToken, user}
 * - POST /v1/auth/google {idToken}       -> JWKS検証 -> users upsert(google_sub) -> {accessToken, refreshToken, user}
 * - POST /v1/auth/refresh {refreshToken} -> ローテーション(旧トークン無効化+新規発行)
 *
 * DB未設定(DATABASE_URLなし・非テスト環境)の場合は503を返す(他ルートと同様の方針)。
 */

import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { JWTVerifyGetKey } from "jose";
import { getDb, isDbConfigured } from "../db/client.js";
import { DEV_USER_ID } from "../db/seed.js";
import { refreshTokens, users } from "../db/schema.js";
import {
  IdTokenVerificationError,
  MissingAudienceError,
  verifyAppleIdentityToken,
  verifyGoogleIdToken,
} from "../lib/oauth-verify.js";
import {
  hashRefreshToken,
  issueRefreshToken,
  MissingJwtSecretError,
  signAccessToken,
} from "../lib/jwt.js";

export const authRoute = new Hono();

const AppleAuthRequestSchema = z.object({
  identityToken: z.string().min(1),
});

const GoogleAuthRequestSchema = z.object({
  idToken: z.string().min(1),
});

const RefreshRequestSchema = z.object({
  refreshToken: z.string().min(1),
});

function dbUnavailableResponse(c: import("hono").Context) {
  return c.json(
    {
      error_kind: "db_unavailable",
      message: "DBが設定されていません。DATABASE_URLを設定してください。",
    },
    503,
  );
}

/**
 * テスト用: Apple/Google JWKS の取得元を注入できるようにする。
 * 本番では未設定(リモートJWKS)。
 */
export interface AuthRouteTestOverrides {
  appleJwks?: JWTVerifyGetKey;
  googleJwks?: JWTVerifyGetKey;
}

let testOverrides: AuthRouteTestOverrides = {};

/** テスト用: JWKS取得元を注入する。 */
export function _setAuthTestOverrides(overrides: AuthRouteTestOverrides): void {
  testOverrides = overrides;
}

/** テスト用: 注入したJWKS取得元をリセットする。 */
export function _resetAuthTestOverrides(): void {
  testOverrides = {};
}

interface UserRow {
  id: string;
  appleSub: string | null;
  googleSub: string | null;
  email: string | null;
  displayName: string | null;
}

/** users をsub(apple_sub/google_sub)でupsertする。既存ユーザーはemailを更新する。 */
async function upsertUserBySub(
  provider: "apple" | "google",
  sub: string,
  email: string | null,
): Promise<UserRow> {
  const db = await getDb();
  const column = provider === "apple" ? users.appleSub : users.googleSub;

  const existing = await db.select().from(users).where(eq(column, sub)).limit(1);
  const existingUser = existing[0];

  if (existingUser) {
    if (email && email !== existingUser.email) {
      await db.update(users).set({ email }).where(eq(users.id, existingUser.id));
      return { ...existingUser, email };
    }
    return existingUser;
  }

  const inserted = await db
    .insert(users)
    .values(
      provider === "apple"
        ? { appleSub: sub, email }
        : { googleSub: sub, email },
    )
    .returning();

  const userRow = inserted[0];
  if (!userRow) {
    throw new Error("upsertUserBySub: insertに失敗しました。");
  }
  return userRow;
}

/** アクセスJWT+リフレッシュトークンを発行し、リフレッシュトークンをDBに記録する。 */
async function issueTokenPair(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
  const db = await getDb();
  const accessToken = await signAccessToken(userId);
  const refresh = issueRefreshToken();

  await db.insert(refreshTokens).values({
    userId,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
  });

  return { accessToken, refreshToken: refresh.token };
}

function userResponse(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

/**
 * POST /v1/auth/apple
 * {identityToken} -> JWKS検証(appleid.apple.com/auth/keys) -> users upsert(apple_sub) -> トークン発行
 */
authRoute.post("/v1/auth/apple", async (c) => {
  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }

  const body = await c.req.json().catch(() => null);
  const parseResult = AppleAuthRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ error_kind: "invalid_request", message: "リクエストボディが不正です。" }, 400);
  }

  try {
    const identity = await verifyAppleIdentityToken(
      parseResult.data.identityToken,
      testOverrides.appleJwks,
    );
    const user = await upsertUserBySub("apple", identity.sub, identity.email);
    const tokens = await issueTokenPair(user.id);
    return c.json({ ...tokens, user: userResponse(user) }, 200);
  } catch (err) {
    return handleAuthError(c, err);
  }
});

/**
 * POST /v1/auth/google
 * {idToken} -> JWKS検証(googleapis.com/oauth2/v3/certs) -> users upsert(google_sub) -> トークン発行
 */
authRoute.post("/v1/auth/google", async (c) => {
  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }

  const body = await c.req.json().catch(() => null);
  const parseResult = GoogleAuthRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ error_kind: "invalid_request", message: "リクエストボディが不正です。" }, 400);
  }

  try {
    const identity = await verifyGoogleIdToken(parseResult.data.idToken, testOverrides.googleJwks);
    const user = await upsertUserBySub("google", identity.sub, identity.email);
    const tokens = await issueTokenPair(user.id);
    return c.json({ ...tokens, user: userResponse(user) }, 200);
  } catch (err) {
    return handleAuthError(c, err);
  }
});

/**
 * POST /v1/auth/dev
 *
 * Webデモ/開発用のサインイン。`DEV_TOKEN` が設定されている場合のみ有効(未設定時は404)。
 * 固定devユーザー(`DEV_USER_ID`)向けのアクセスJWT(+ DB設定時はリフレッシュトークン)を発行する。
 *
 * これにより、モバイル側の `EXPO_PUBLIC_DEV_TOKEN` の値はAPI側の `DEV_TOKEN` と
 * 一致させる必要がなくなる(両方が「devログインを有効にするか」のフラグとしてのみ機能する)。
 */
authRoute.post("/v1/auth/dev", async (c) => {
  if (!process.env["DEV_TOKEN"]) {
    return c.json(
      { error_kind: "not_found", message: "DEV_TOKEN が設定されていません。サーバ環境変数を確認してください。" },
      404,
    );
  }

  try {
    if (!isDbConfigured()) {
      const accessToken = await signAccessToken(DEV_USER_ID);
      return c.json(
        { accessToken, refreshToken: "", user: { id: DEV_USER_ID, email: null, displayName: "Dev User" } },
        200,
      );
    }

    const tokens = await issueTokenPair(DEV_USER_ID);
    return c.json(
      { ...tokens, user: { id: DEV_USER_ID, email: null, displayName: "Dev User" } },
      200,
    );
  } catch (err) {
    return handleAuthError(c, err);
  }
});

/**
 * POST /v1/auth/refresh
 * {refreshToken} -> ローテーション(旧トークンをDBから削除+新規発行)。
 *
 * - トークンが見つからない/期限切れ -> 401(再利用拒否を含む。ローテーション済みの旧トークンは
 *   既にDBから削除されているため、再送は「見つからない」扱いで401になる)。
 */
authRoute.post("/v1/auth/refresh", async (c) => {
  if (!isDbConfigured()) {
    return dbUnavailableResponse(c);
  }

  const body = await c.req.json().catch(() => null);
  const parseResult = RefreshRequestSchema.safeParse(body);
  if (!parseResult.success) {
    return c.json({ error_kind: "invalid_request", message: "リクエストボディが不正です。" }, 400);
  }

  const db = await getDb();
  const tokenHash = hashRefreshToken(parseResult.data.refreshToken);

  const existing = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);
  const existingToken = existing[0];

  if (!existingToken) {
    return c.json({ error_kind: "invalid_token", message: "リフレッシュトークンが無効です。" }, 401);
  }

  // 旧トークンを無効化(削除)する。期限切れの場合もここで削除し、以後は再利用不可。
  await db.delete(refreshTokens).where(eq(refreshTokens.id, existingToken.id));

  if (existingToken.expiresAt.getTime() < Date.now()) {
    return c.json({ error_kind: "invalid_token", message: "リフレッシュトークンの期限が切れています。" }, 401);
  }

  try {
    const accessToken = await signAccessToken(existingToken.userId);
    const refresh = issueRefreshToken();

    await db.insert(refreshTokens).values({
      userId: existingToken.userId,
      tokenHash: refresh.tokenHash,
      expiresAt: refresh.expiresAt,
    });

    return c.json({ accessToken, refreshToken: refresh.token }, 200);
  } catch (err) {
    return handleAuthError(c, err);
  }
});

function handleAuthError(c: import("hono").Context, err: unknown) {
  if (err instanceof MissingAudienceError || err instanceof MissingJwtSecretError) {
    return c.json({ error_kind: "config_error", message: err.message }, 500);
  }
  if (err instanceof IdTokenVerificationError) {
    return c.json({ error_kind: "invalid_token", message: err.message }, 401);
  }
  console.error("auth route error:", err);
  return c.json({ error_kind: "error", message: "認証中にエラーが発生しました。" }, 500);
}
