/**
 * scripts/check-cache.ts
 *
 * prompt caching の動作確認スクリプト(PLAN.md §4.7)。
 *
 * SYSTEM_PROMPT(静的文字列・4,096トークン以上)に cache_control: ephemeral を
 * 付与した状態で同一モデルに連続2回リクエストし、2回目の
 * `usage.cache_read_input_tokens > 0` を確認する。
 *
 * 実行方法:
 *   ANTHROPIC_API_KEY=sk-ant-... pnpm --filter @pashacaro/scripts check-cache
 *
 * 注意: この環境(開発・CI)には ANTHROPIC_API_KEY が無いため、本スクリプトは
 * 実行不可。コードのみ用意し、実APIキーがある環境で動作確認すること。
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AnalysisSchema, SYSTEM_PROMPT } from "@pashacaro/shared";

const HAIKU_MODEL = "claude-haiku-4-5";

// 1x1の透明PNG(ダミー画像)。実際の食事写真でなくても
// prompt cachingの確認(systemブロックのキャッシュヒット)には十分。
const DUMMY_IMAGE_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function main(): Promise<void> {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY が設定されていません。このスクリプトは ANTHROPIC_API_KEY のある環境で実行してください。",
    );
    process.exitCode = 1;
    return;
  }

  const client = new Anthropic({ apiKey });
  const context = "撮影時刻: 12:30。ユーザー補足: なし(これはキャッシュ確認用のダミーリクエストです)";

  const usages: Anthropic.Messages.Usage[] = [];

  for (let i = 1; i <= 2; i++) {
    console.log(`--- request ${i} ---`);
    const response = await client.messages.parse({
      model: HAIKU_MODEL,
      max_tokens: 1024,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: DUMMY_IMAGE_BASE64 },
            },
            { type: "text", text: context },
          ],
        },
      ],
      output_config: { format: zodOutputFormat(AnalysisSchema) },
    });

    console.log("usage:", JSON.stringify(response.usage, null, 2));
    usages.push(response.usage);
  }

  const secondUsage = usages[1]!;
  const cacheReadTokens = secondUsage.cache_read_input_tokens ?? 0;

  console.log("");
  console.log(`2回目リクエストの cache_read_input_tokens = ${cacheReadTokens}`);

  if (cacheReadTokens > 0) {
    console.log("OK: prompt cachingが機能しています (cache_read_input_tokens > 0)");
  } else {
    console.error(
      "NG: cache_read_input_tokens が0です。SYSTEM_PROMPTが4,096トークン未満、" +
        "または可変要素がsystemブロックに混入していないか確認してください。",
    );
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("check-cache failed:", err);
  process.exitCode = 1;
});
