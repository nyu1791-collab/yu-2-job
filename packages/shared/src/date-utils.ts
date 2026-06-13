/**
 * 日付ユーティリティ(Asia/Tokyo固定。PLAN.md §4.0 — UTC変換禁止の単一国サービス)。
 *
 * Asia/Tokyo は UTC+9 固定(夏時間なし)。
 */

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 現在時刻(UTC)から Asia/Tokyo の "YYYY-MM-DD" を返す。 */
export function todayInTokyo(now: Date = new Date()): string {
  const tokyoNow = new Date(now.getTime() + TOKYO_OFFSET_MS);
  const y = tokyoNow.getUTCFullYear();
  const m = String(tokyoNow.getUTCMonth() + 1).padStart(2, "0");
  const d = String(tokyoNow.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 現在時刻(UTC)から Asia/Tokyo の "HH:MM:SS" を返す(meals.eaten_at用)。 */
export function nowTimeInTokyo(now: Date = new Date()): string {
  const tokyoNow = new Date(now.getTime() + TOKYO_OFFSET_MS);
  const h = String(tokyoNow.getUTCHours()).padStart(2, "0");
  const min = String(tokyoNow.getUTCMinutes()).padStart(2, "0");
  const s = String(tokyoNow.getUTCSeconds()).padStart(2, "0");
  return `${h}:${min}:${s}`;
}
