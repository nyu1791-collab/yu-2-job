import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { analyzeRoute } from "./routes/analyze.js";
import { authRoute } from "./routes/auth.js";
import { internalRoute } from "./routes/internal.js";
import { mealsRoute } from "./routes/meals.js";
import { meRoute } from "./routes/me.js";
import { summaryRoute } from "./routes/summary.js";
import { webhooksRoute } from "./routes/webhooks.js";

export function createApp(): Hono {
  const app = new Hono();

  // CORS: WebデモはモバイルApp(別のVercelドメイン)からこのAPIを叩くため、
  // クロスオリジンのfetch/プリフライト(OPTIONS)を許可する。
  // 認証はAuthorizationヘッダ(Bearer)で行いCookieは使わないため、
  // origin "*" + Authorization/Content-Type 許可で十分(credentialsは使わない)。
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 86400,
    }),
  );

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.route("/", authRoute);
  app.route("/", meRoute);
  app.route("/", analyzeRoute);
  app.route("/", mealsRoute);
  app.route("/", summaryRoute);
  app.route("/", webhooksRoute);
  app.route("/", internalRoute);

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error_kind: "http_error", message: err.message }, err.status);
    }
    console.error("Unhandled error:", err);
    return c.json({ error_kind: "error", message: "Internal Server Error" }, 500);
  });

  return app;
}
