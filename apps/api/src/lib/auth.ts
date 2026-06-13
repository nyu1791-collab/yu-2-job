import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { DEV_USER_ID } from "../db/seed.js";
import { verifyAccessToken } from "./jwt.js";

/**
 * 認証ミドルウェア(PLAN.md §4.5 M3)。
 *
 * `Authorization: Bearer <token>` を要求する。トークンは以下のいずれか:
 *   1. 固定devトークン(`DEV_TOKEN` と一致) -> devユーザー(`DEV_USER_ID`)として扱う。
 *      M1/M2のテスト・検証を壊さないため、引き続き許可する。
 *   2. 自前アクセスJWT(HS256, `JWT_SECRET`で署名) -> JWTのsubをuserIdとして扱う。
 *
 * 検証に成功した場合、`c.set("userId", ...)` でハンドラに渡す。
 * `/v1/me/*`・`/v1/meals`・`/v1/analyze` 等で使用する。
 */
export function requireAuth() {
  return async (c: Context, next: Next) => {
    const devToken = process.env["DEV_TOKEN"];
    const jwtSecret = process.env["JWT_SECRET"];
    if (!devToken && !jwtSecret) {
      throw new HTTPException(500, {
        message: "DEV_TOKEN/JWT_SECRET のいずれも設定されていません。サーバ環境変数を確認してください。",
      });
    }

    const header = c.req.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) {
      throw new HTTPException(401, { message: "Authorizationヘッダーが必要です。" });
    }
    const token = header.slice("Bearer ".length);

    if (devToken && token === devToken) {
      c.set("userId", DEV_USER_ID);
      await next();
      return;
    }

    const userId = await verifyAccessToken(token);
    if (!userId) {
      throw new HTTPException(401, { message: "トークンが無効です。" });
    }

    c.set("userId", userId);
    await next();
  };
}

/** ハンドラ内で認証済みユーザーIDを取得する。 */
export function getUserId(c: Context): string {
  const userId = c.get("userId") as string | undefined;
  if (!userId) {
    throw new HTTPException(401, { message: "認証が必要です。" });
  }
  return userId;
}
