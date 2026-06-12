import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { analyzeRoute } from "./routes/analyze.js";

export function createApp(): Hono {
  const app = new Hono();

  app.get("/health", (c) => c.json({ status: "ok" }));

  app.route("/", analyzeRoute);

  app.onError((err, c) => {
    if (err instanceof HTTPException) {
      return c.json({ error_kind: "http_error", message: err.message }, err.status);
    }
    console.error("Unhandled error:", err);
    return c.json({ error_kind: "error", message: "Internal Server Error" }, 500);
  });

  return app;
}
