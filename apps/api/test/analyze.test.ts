import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  _resetClientForTest,
  callModel,
  MissingApiKeyError,
  HAIKU_MODEL,
} from "../src/lib/analyze.js";

const ORIGINAL_ENV = { ...process.env };

describe("callModel", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    _resetClientForTest();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    _resetClientForTest();
  });

  it("throws MissingApiKeyError when ANTHROPIC_API_KEY is not set", async () => {
    delete process.env["ANTHROPIC_API_KEY"];

    await expect(
      callModel(HAIKU_MODEL, {
        mediaType: "image/jpeg",
        imageBase64: "AAAA",
        context: "test",
      }),
    ).rejects.toBeInstanceOf(MissingApiKeyError);
  });
});
