import { describe, expect, it } from "vitest";
import { nowTimeInTokyo, todayInTokyo } from "../src/date-utils.js";

describe("todayInTokyo", () => {
  it("UTC日付の23:00以降(Asia/Tokyoでは翌日)を正しく繰り上げる", () => {
    // 2026-06-12T23:30:00Z -> Asia/Tokyo 2026-06-13 08:30
    expect(todayInTokyo(new Date("2026-06-12T23:30:00.000Z"))).toBe("2026-06-13");
  });

  it("UTC日付のまま(日付が変わらない時間帯)はそのまま", () => {
    // 2026-06-12T03:00:00Z -> Asia/Tokyo 2026-06-12 12:00
    expect(todayInTokyo(new Date("2026-06-12T03:00:00.000Z"))).toBe("2026-06-12");
  });

  it("年/月末をまたぐ場合も正しい", () => {
    // 2025-12-31T15:30:00Z -> Asia/Tokyo 2026-01-01 00:30
    expect(todayInTokyo(new Date("2025-12-31T15:30:00.000Z"))).toBe("2026-01-01");
  });
});

describe("nowTimeInTokyo", () => {
  it("UTC時刻をAsia/Tokyo(UTC+9)の HH:MM:SS に変換する", () => {
    // 2026-06-12T03:04:05Z -> Asia/Tokyo 12:04:05
    expect(nowTimeInTokyo(new Date("2026-06-12T03:04:05.000Z"))).toBe("12:04:05");
  });

  it("日付をまたぐ時刻(UTC15:00以降)も正しく変換する", () => {
    // 2026-06-12T23:30:00Z -> Asia/Tokyo 2026-06-13 08:30:00
    expect(nowTimeInTokyo(new Date("2026-06-12T23:30:00.000Z"))).toBe("08:30:00");
  });

  it("0時台・1桁の時刻はゼロ埋めされる", () => {
    // 2026-06-12T15:05:09Z -> Asia/Tokyo 2026-06-13 00:05:09
    expect(nowTimeInTokyo(new Date("2026-06-12T15:05:09.000Z"))).toBe("00:05:09");
  });
});
