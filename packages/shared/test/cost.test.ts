import { describe, expect, it } from "vitest";
import { computeAnalysisCostUsd, HAIKU_MODEL_ID, SONNET_MODEL_ID } from "../src/cost.js";

describe("computeAnalysisCostUsd", () => {
  it("Haiku: 入力・出力トークンのみ(キャッシュなし)", () => {
    // 5000 input tokens * $1.00/1M + 600 output tokens * $5.00/1M
    const cost = computeAnalysisCostUsd({
      model: HAIKU_MODEL_ID,
      input_tokens: 5000,
      output_tokens: 600,
    });
    const expected = (5000 / 1_000_000) * 1.0 + (600 / 1_000_000) * 5.0;
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("Haiku: キャッシュヒット(cache_read_input_tokens)時は読み取り単価(0.1倍)が適用される", () => {
    const cost = computeAnalysisCostUsd({
      model: HAIKU_MODEL_ID,
      input_tokens: 100,
      output_tokens: 600,
      cache_read_input_tokens: 4900,
    });
    const expected =
      (100 / 1_000_000) * 1.0 + (600 / 1_000_000) * 5.0 + (4900 / 1_000_000) * (1.0 * 0.1);
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("Haiku: キャッシュ書き込み(cache_creation_input_tokens)時は1.25倍の単価が適用される", () => {
    const cost = computeAnalysisCostUsd({
      model: HAIKU_MODEL_ID,
      input_tokens: 100,
      output_tokens: 600,
      cache_creation_input_tokens: 4900,
    });
    const expected =
      (100 / 1_000_000) * 1.0 + (600 / 1_000_000) * 5.0 + (4900 / 1_000_000) * (1.0 * 1.25);
    expect(cost).toBeCloseTo(expected, 10);
  });

  it("Sonnet: 入力・出力トークン単価はHaikuの3倍", () => {
    const haikuCost = computeAnalysisCostUsd({
      model: HAIKU_MODEL_ID,
      input_tokens: 1000,
      output_tokens: 1000,
    });
    const sonnetCost = computeAnalysisCostUsd({
      model: SONNET_MODEL_ID,
      input_tokens: 1000,
      output_tokens: 1000,
    });
    expect(sonnetCost).toBeCloseTo(haikuCost * 3, 10);
  });

  it("usageが全て0の場合は0を返す", () => {
    expect(
      computeAnalysisCostUsd({
        model: HAIKU_MODEL_ID,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      }),
    ).toBe(0);
  });

  it("未知のモデル名はSonnetのレート(より高い=保守的)にフォールバックする", () => {
    const unknownCost = computeAnalysisCostUsd({
      model: "unknown-model",
      input_tokens: 1000,
      output_tokens: 1000,
    });
    const sonnetCost = computeAnalysisCostUsd({
      model: SONNET_MODEL_ID,
      input_tokens: 1000,
      output_tokens: 1000,
    });
    expect(unknownCost).toBeCloseTo(sonnetCost, 10);
  });

  it("cache_read/cache_creationがnullの場合も正しく0として扱われる", () => {
    const cost = computeAnalysisCostUsd({
      model: HAIKU_MODEL_ID,
      input_tokens: 1000,
      output_tokens: 500,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
    });
    const expected = (1000 / 1_000_000) * 1.0 + (500 / 1_000_000) * 5.0;
    expect(cost).toBeCloseTo(expected, 10);
  });
});
