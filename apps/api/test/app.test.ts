import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { _resetClientForTest } from "../src/lib/analyze.js";
import { _resetDbForTest, _setDbForTest, type Db } from "../src/db/client.js";
import { setupTestDb } from "./helpers/db.js";

const ORIGINAL_ENV = { ...process.env };

describe("createApp", () => {
  let db: Db;

  beforeAll(async () => {
    db = await setupTestDb();
  });

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    _resetClientForTest();
    _setDbForTest(db);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    _resetClientForTest();
    _resetDbForTest();
  });

  afterAll(async () => {
    const maybeClose = (db as unknown as { $client?: { close?: () => Promise<void> } }).$client;
    await maybeClose?.close?.();
  });

  it("GET /health returns 200 ok", async () => {
    const app = createApp();
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("POST /v1/analyze without Authorization header returns 401", async () => {
    process.env["DEV_TOKEN"] = "dev-secret";
    const app = createApp();
    const res = await app.request("/v1/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ imageBase64: "AAAA", mediaType: "image/jpeg" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /v1/analyze with wrong token returns 401", async () => {
    process.env["DEV_TOKEN"] = "dev-secret";
    const app = createApp();
    const res = await app.request("/v1/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({ imageBase64: "AAAA", mediaType: "image/jpeg" }),
    });
    expect(res.status).toBe(401);
  });

  it("POST /v1/analyze with valid dev token but missing ANTHROPIC_API_KEY returns 500 config_error", async () => {
    process.env["DEV_TOKEN"] = "dev-secret";
    delete process.env["ANTHROPIC_API_KEY"];
    const app = createApp();
    const res = await app.request("/v1/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer dev-secret",
      },
      body: JSON.stringify({ imageBase64: "AAAA", mediaType: "image/jpeg" }),
    });
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error_kind: string };
    expect(body.error_kind).toBe("config_error");
  });

  it("POST /v1/analyze with image larger than 2MB returns 413", async () => {
    process.env["DEV_TOKEN"] = "dev-secret";
    const app = createApp();
    // base64 string > 2MB
    const bigBase64 = "A".repeat(2 * 1024 * 1024 + 10);
    const res = await app.request("/v1/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer dev-secret",
      },
      body: JSON.stringify({ imageBase64: bigBase64, mediaType: "image/jpeg" }),
    });
    expect(res.status).toBe(413);
    const body = (await res.json()) as { error_kind: string };
    expect(body.error_kind).toBe("image_too_large");
  });

  it("POST /v1/analyze with invalid body returns 400", async () => {
    process.env["DEV_TOKEN"] = "dev-secret";
    const app = createApp();
    const res = await app.request("/v1/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer dev-secret",
      },
      body: JSON.stringify({ foo: "bar" }),
    });
    expect(res.status).toBe(400);
  });

  it("POST /v1/analyze/text without auth returns 401", async () => {
    process.env["DEV_TOKEN"] = "dev-secret";
    const app = createApp();
    const res = await app.request("/v1/analyze/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "カレーライス大盛り" }),
    });
    expect(res.status).toBe(401);
  });

  it("when neither DEV_TOKEN nor JWT_SECRET env is set, requireAuth returns 500", async () => {
    delete process.env["DEV_TOKEN"];
    delete process.env["JWT_SECRET"];
    const app = createApp();
    const res = await app.request("/v1/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer anything",
      },
      body: JSON.stringify({ imageBase64: "AAAA", mediaType: "image/jpeg" }),
    });
    expect(res.status).toBe(500);
  });
});
