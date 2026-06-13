/**
 * 認証API統合テスト(M3)。
 *
 * - POST /v1/auth/apple, /v1/auth/google: ローカル生成したJWKSをモックしてJWT発行を検証
 * - POST /v1/auth/refresh: ローテーション(再利用拒否)を検証
 * - JWT発行/検証(verifyAccessToken)
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { _resetDbForTest, _setDbForTest, type Db } from "../src/db/client.js";
import {
  _resetAuthTestOverrides,
  _setAuthTestOverrides,
} from "../src/routes/auth.js";
import { APPLE_ISSUER, GOOGLE_ISSUERS } from "../src/lib/oauth-verify.js";
import { signAccessToken, verifyAccessToken } from "../src/lib/jwt.js";
import { setupTestDb } from "./helpers/db.js";
import { createTestIdTokenKeySet } from "./helpers/jwks.js";

const ORIGINAL_ENV = { ...process.env };

describe("/v1/auth/apple, /v1/auth/google", () => {
  let db: Db;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      JWT_SECRET: "test-jwt-secret",
      APPLE_CLIENT_ID: "com.pashacaro.app",
      GOOGLE_CLIENT_ID: "pashacaro.apps.googleusercontent.com",
    };
    _setDbForTest(db);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    _resetDbForTest();
    _resetAuthTestOverrides();
  });

  afterAll(async () => {
    const maybeClose = (db as unknown as { $client?: { close?: () => Promise<void> } }).$client;
    await maybeClose?.close?.();
  });

  it("POST /v1/auth/apple: JWKS検証成功 -> users upsert + accessToken/refreshToken発行", async () => {
    const { jwks, signIdToken } = await createTestIdTokenKeySet();
    _setAuthTestOverrides({ appleJwks: jwks });

    const identityToken = await signIdToken({
      sub: "apple-sub-001",
      email: "apple-user@example.com",
      issuer: APPLE_ISSUER,
      audience: "com.pashacaro.app",
    });

    const app = createApp();
    const res = await app.request("/v1/auth/apple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityToken }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string | null };
    };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toHaveLength(64); // 32byte hex
    expect(body.user.email).toBe("apple-user@example.com");

    // アクセスJWTを検証するとそのユーザーIDが取得できる
    const userId = await verifyAccessToken(body.accessToken);
    expect(userId).toBe(body.user.id);
  });

  it("POST /v1/auth/apple: 同じsubで2回サインインしても同一ユーザーにupsertされる", async () => {
    const { jwks, signIdToken } = await createTestIdTokenKeySet();
    _setAuthTestOverrides({ appleJwks: jwks });

    const identityToken1 = await signIdToken({
      sub: "apple-sub-002",
      email: "user2@example.com",
      issuer: APPLE_ISSUER,
      audience: "com.pashacaro.app",
    });
    const identityToken2 = await signIdToken({
      sub: "apple-sub-002",
      email: "user2@example.com",
      issuer: APPLE_ISSUER,
      audience: "com.pashacaro.app",
    });

    const app = createApp();
    const res1 = await app.request("/v1/auth/apple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityToken: identityToken1 }),
    });
    const res2 = await app.request("/v1/auth/apple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityToken: identityToken2 }),
    });

    const body1 = (await res1.json()) as { user: { id: string } };
    const body2 = (await res2.json()) as { user: { id: string } };
    expect(body1.user.id).toBe(body2.user.id);
  });

  it("POST /v1/auth/apple: JWKS検証失敗(audience不一致)は401", async () => {
    const { jwks, signIdToken } = await createTestIdTokenKeySet();
    _setAuthTestOverrides({ appleJwks: jwks });

    const identityToken = await signIdToken({
      sub: "apple-sub-003",
      issuer: APPLE_ISSUER,
      audience: "com.wrong.app", // APPLE_CLIENT_IDと不一致
    });

    const app = createApp();
    const res = await app.request("/v1/auth/apple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityToken }),
    });

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error_kind: string };
    expect(body.error_kind).toBe("invalid_token");
  });

  it("POST /v1/auth/apple: 期限切れトークンは401", async () => {
    const { jwks, signIdToken } = await createTestIdTokenKeySet();
    _setAuthTestOverrides({ appleJwks: jwks });

    const identityToken = await signIdToken({
      sub: "apple-sub-004",
      issuer: APPLE_ISSUER,
      audience: "com.pashacaro.app",
      expired: true,
    });

    const app = createApp();
    const res = await app.request("/v1/auth/apple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityToken }),
    });

    expect(res.status).toBe(401);
  });

  it("POST /v1/auth/google: JWKS検証成功 -> users upsert + accessToken/refreshToken発行", async () => {
    const { jwks, signIdToken } = await createTestIdTokenKeySet();
    _setAuthTestOverrides({ googleJwks: jwks });

    const idToken = await signIdToken({
      sub: "google-sub-001",
      email: "google-user@example.com",
      issuer: GOOGLE_ISSUERS[0]!,
      audience: "pashacaro.apps.googleusercontent.com",
    });

    const app = createApp();
    const res = await app.request("/v1/auth/google", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      accessToken: string;
      refreshToken: string;
      user: { id: string; email: string | null };
    };
    expect(body.user.email).toBe("google-user@example.com");
    expect(await verifyAccessToken(body.accessToken)).toBe(body.user.id);
  });

  it("POST /v1/auth/apple: 不正なリクエストボディは400", async () => {
    const app = createApp();
    const res = await app.request("/v1/auth/apple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /v1/auth/refresh", () => {
  let db: Db;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  beforeEach(() => {
    process.env = {
      ...ORIGINAL_ENV,
      JWT_SECRET: "test-jwt-secret",
      APPLE_CLIENT_ID: "com.pashacaro.app",
      GOOGLE_CLIENT_ID: "pashacaro.apps.googleusercontent.com",
    };
    _setDbForTest(db);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    _resetDbForTest();
    _resetAuthTestOverrides();
  });

  afterAll(async () => {
    const maybeClose = (db as unknown as { $client?: { close?: () => Promise<void> } }).$client;
    await maybeClose?.close?.();
  });

  async function signInWithApple(sub: string): Promise<{ refreshToken: string; accessToken: string; userId: string }> {
    const { jwks, signIdToken } = await createTestIdTokenKeySet();
    _setAuthTestOverrides({ appleJwks: jwks });
    const identityToken = await signIdToken({
      sub,
      email: `${sub}@example.com`,
      issuer: APPLE_ISSUER,
      audience: "com.pashacaro.app",
    });

    const app = createApp();
    const res = await app.request("/v1/auth/apple", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identityToken }),
    });
    const body = (await res.json()) as { accessToken: string; refreshToken: string; user: { id: string } };
    return { refreshToken: body.refreshToken, accessToken: body.accessToken, userId: body.user.id };
  }

  it("正しいリフレッシュトークン -> ローテーションされた新トークンを返す", async () => {
    const { refreshToken, userId } = await signInWithApple("apple-sub-refresh-1");

    const app = createApp();
    const res = await app.request("/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { accessToken: string; refreshToken: string };
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toHaveLength(64);
    expect(body.refreshToken).not.toBe(refreshToken);

    const newUserId = await verifyAccessToken(body.accessToken);
    expect(newUserId).toBe(userId);
  });

  it("ローテーション後、旧リフレッシュトークンの再利用は拒否される(401)", async () => {
    const { refreshToken } = await signInWithApple("apple-sub-refresh-2");

    const app = createApp();
    const firstRes = await app.request("/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(firstRes.status).toBe(200);

    // 旧トークンを再送 -> 401
    const secondRes = await app.request("/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });
    expect(secondRes.status).toBe(401);
    const body = (await secondRes.json()) as { error_kind: string };
    expect(body.error_kind).toBe("invalid_token");
  });

  it("不正なリフレッシュトークンは401", async () => {
    const app = createApp();
    const res = await app.request("/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: "not-a-real-token" }),
    });
    expect(res.status).toBe(401);
  });

  it("不正なリクエストボディ(refreshTokenなし)は400", async () => {
    const app = createApp();
    const res = await app.request("/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("JWT発行/検証 (signAccessToken / verifyAccessToken)", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, JWT_SECRET: "test-jwt-secret" };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  it("正常に発行・検証できる", async () => {
    const token = await signAccessToken("user-123");
    const userId = await verifyAccessToken(token);
    expect(userId).toBe("user-123");
  });

  it("不正な署名は検証失敗(null)", async () => {
    const token = await signAccessToken("user-123");
    process.env["JWT_SECRET"] = "different-secret";
    const userId = await verifyAccessToken(token);
    expect(userId).toBeNull();
  });

  it("形式が不正なトークンは検証失敗(null)", async () => {
    const userId = await verifyAccessToken("not-a-jwt");
    expect(userId).toBeNull();
  });
});
