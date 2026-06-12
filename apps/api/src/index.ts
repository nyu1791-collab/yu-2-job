import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const app = createApp();

const port = Number(process.env["PORT"] ?? 8787);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`pashacaro API listening on http://localhost:${info.port}`);
  if (!process.env["ANTHROPIC_API_KEY"]) {
    console.warn(
      "[warn] ANTHROPIC_API_KEY is not set. /v1/analyze and /v1/analyze/text will return 500 until it is configured.",
    );
  }
  if (!process.env["DEV_TOKEN"]) {
    console.warn(
      "[warn] DEV_TOKEN is not set. /v1/analyze and /v1/analyze/text will return 500 for all requests.",
    );
  }
});
