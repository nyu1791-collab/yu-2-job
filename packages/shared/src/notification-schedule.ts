/**
 * ローカル通知のスケジュール計算(M6)。
 *
 * Asia/Tokyo 固定(UTC+9, 夏時間なし)で、指定した時刻(時・分)の
 * 「次回発火時刻」を計算する純関数群。
 *
 * - 指定時刻が現在時刻より未来(同日内)であれば、その時刻(本日)を返す。
 * - 既に過ぎていれば、翌日の同時刻を返す。
 *
 * 実際のスケジューリング(expo-notifications呼び出し)はこのモジュールでは行わない。
 * アプリ側はこの結果(Date)を `Notifications.scheduleNotificationAsync` の
 * `trigger` (date) に渡す想定。
 */

const TOKYO_OFFSET_MS = 9 * 60 * 60 * 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 指定した Asia/Tokyo 時刻(hour:minute)の「次回発火時刻」をUTCのDateとして返す。
 *
 * - now (UTC) を Asia/Tokyo に変換し、その日の hour:minute:00 と比較する。
 * - now がその時刻より前であれば本日のその時刻、以降であれば翌日のその時刻を返す。
 *
 * @param hour   0-23 (Asia/Tokyo)
 * @param minute 0-59 (Asia/Tokyo)
 * @param now    現在時刻(UTC)。デフォルトは `new Date()`。
 */
export function nextFireTimeInTokyo(hour: number, minute: number, now: Date = new Date()): Date {
  const tokyoNow = new Date(now.getTime() + TOKYO_OFFSET_MS);

  const candidateTokyo = new Date(tokyoNow);
  candidateTokyo.setUTCHours(hour, minute, 0, 0);

  let targetTokyoMs = candidateTokyo.getTime();
  if (targetTokyoMs <= tokyoNow.getTime()) {
    targetTokyoMs += MS_PER_DAY;
  }

  // Asia/Tokyo の時刻(targetTokyoMs)をUTCに戻す。
  return new Date(targetTokyoMs - TOKYO_OFFSET_MS);
}

export interface ReminderTime {
  hour: number;
  minute: number;
}

/** PLAN.md §4.6: 12:30 / 19:30 (Asia/Tokyo) のリマインダー時刻。 */
export const DEFAULT_REMINDER_TIMES: ReminderTime[] = [
  { hour: 12, minute: 30 },
  { hour: 19, minute: 30 },
];

/**
 * 当日の食事記録が無い場合に通知すべきリマインダーの「次回発火時刻」一覧を返す。
 *
 * - `hasMealToday` が true の場合は空配列(=スケジュール不要、既存予約はキャンセルする)。
 * - false の場合は `times`(デフォルト DEFAULT_REMINDER_TIMES)それぞれについて
 *   `nextFireTimeInTokyo` を計算して返す。
 */
export function computeReminderFireTimes(
  hasMealToday: boolean,
  now: Date = new Date(),
  times: ReminderTime[] = DEFAULT_REMINDER_TIMES,
): Date[] {
  if (hasMealToday) {
    return [];
  }
  return times.map((t) => nextFireTimeInTokyo(t.hour, t.minute, now));
}
