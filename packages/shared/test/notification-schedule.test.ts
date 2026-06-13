import { describe, expect, it } from "vitest";
import {
  computeReminderFireTimes,
  DEFAULT_REMINDER_TIMES,
  nextFireTimeInTokyo,
} from "../src/notification-schedule.js";

describe("nextFireTimeInTokyo", () => {
  it("指定時刻がまだ来ていない場合は本日のその時刻(UTC)を返す", () => {
    // 2026-06-13T02:00:00Z -> Asia/Tokyo 11:00。12:30はまだ未来 -> 本日12:30 JST = 03:30 UTC
    const now = new Date("2026-06-13T02:00:00.000Z");
    const result = nextFireTimeInTokyo(12, 30, now);
    expect(result.toISOString()).toBe("2026-06-13T03:30:00.000Z");
  });

  it("指定時刻が既に過ぎている場合は翌日のその時刻(UTC)を返す", () => {
    // 2026-06-13T04:00:00Z -> Asia/Tokyo 13:00。12:30は過去 -> 翌日12:30 JST = 翌日03:30 UTC
    const now = new Date("2026-06-13T04:00:00.000Z");
    const result = nextFireTimeInTokyo(12, 30, now);
    expect(result.toISOString()).toBe("2026-06-14T03:30:00.000Z");
  });

  it("指定時刻と現在時刻が完全に一致する場合は翌日に繰り越す", () => {
    // 2026-06-13T03:30:00Z -> Asia/Tokyo 12:30 ちょうど -> 翌日12:30 JST
    const now = new Date("2026-06-13T03:30:00.000Z");
    const result = nextFireTimeInTokyo(12, 30, now);
    expect(result.toISOString()).toBe("2026-06-14T03:30:00.000Z");
  });

  it("日付をまたぐ時刻指定(19:30 JST)も正しく計算する", () => {
    // 2026-06-13T00:00:00Z -> Asia/Tokyo 09:00。19:30はまだ未来 -> 本日19:30 JST = 10:30 UTC
    const now = new Date("2026-06-13T00:00:00.000Z");
    const result = nextFireTimeInTokyo(19, 30, now);
    expect(result.toISOString()).toBe("2026-06-13T10:30:00.000Z");
  });
});

describe("computeReminderFireTimes", () => {
  const now = new Date("2026-06-13T00:00:00.000Z"); // Asia/Tokyo 09:00

  it("当日の食事記録がある場合は空配列を返す(スケジュール不要)", () => {
    expect(computeReminderFireTimes(true, now)).toEqual([]);
  });

  it("当日の食事記録が無い場合はデフォルトの2件(12:30/19:30 JST)を返す", () => {
    const result = computeReminderFireTimes(false, now);
    expect(result).toHaveLength(2);
    // 12:30 JST = 03:30 UTC, 19:30 JST = 10:30 UTC (どちらも本日中)
    expect(result[0]!.toISOString()).toBe("2026-06-13T03:30:00.000Z");
    expect(result[1]!.toISOString()).toBe("2026-06-13T10:30:00.000Z");
  });

  it("カスタムの時刻リストを渡せる", () => {
    const result = computeReminderFireTimes(false, now, [{ hour: 8, minute: 0 }]);
    expect(result).toHaveLength(1);
    // 08:00 JST = 前日23:00 UTC... now is 09:00 JST, so 08:00 has passed -> next day 08:00 JST = 23:00 UTC same day
    expect(result[0]!.toISOString()).toBe("2026-06-13T23:00:00.000Z");
  });

  it("DEFAULT_REMINDER_TIMESは12:30と19:30の2件", () => {
    expect(DEFAULT_REMINDER_TIMES).toEqual([
      { hour: 12, minute: 30 },
      { hour: 19, minute: 30 },
    ]);
  });
});
