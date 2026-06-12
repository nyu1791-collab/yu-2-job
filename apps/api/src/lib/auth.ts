import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

/**
 * M1向けの固定devトークン認証。
 *
 * `Authorization: Bearer ${DEV_TOKEN}` を要求する。
 * 本番のApple/Googleサインイン+JWT(M3)に置き換える前の暫定実装。
 */
export function requireDevToken() {
  return async (c: Context, next: Next) => {
    const devToken = process.env["DEV_TOKEN"];
    if (!devToken) {
      throw new HTTPException(500, {
        message: "DEV_TOKEN が設定されていません。サーバ環境変数を確認してください。",
      });
    }

    const header = c.req.header("Authorization");
    if (!header || !header.startsWith("Bearer ")) {
      throw new HTTPException(401, { message: "Authorizationヘッダーが必要です。" });
    }

    const token = header.slice("Bearer ".length);
    if (token !== devToken) {
      throw new HTTPException(401, { message: "トークンが無効です。" });
    }

    await next();
  };
}
