import * as SecureStore from "./secure-store";

/**
 * notifications.ts のWeb版シム。
 *
 * `expo-notifications` はWeb(ブラウザ)でローカル通知のスケジュールに対応しておらず、
 * モジュール読み込み時の副作用(setNotificationHandler 等)がWebデモで予期しない
 * クラッシュ(真っ白画面)を起こす恐れがあるため、Webでは `expo-notifications` を
 * 一切importしないこのシムに差し替える(Metro/Expoは .web.ts を .ts より優先して解決する。
 * src/lib/purchases.web.ts と同じ方式)。
 *
 * 通知ON/OFFの設定値だけは設定画面のUIが壊れないよう secure-store(WebではlocalStorage)に
 * 保存するが、実際のスケジュール/権限リクエストは行わない(すべてno-op)。
 */

const SETTING_KEY = "pashacaro.notificationsEnabled";

/** 通知ON/OFF設定を読み込む(未設定時はfalse=OFF)。 */
export async function getNotificationsEnabled(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(SETTING_KEY);
  return value === "true";
}

/**
 * 通知ON/OFF設定を保存する(Webでは権限リクエスト/スケジュールは行わず値の保存のみ)。
 * @returns 設定された値(Webでは指定値をそのまま返す)。
 */
export async function setNotificationsEnabled(enabled: boolean): Promise<boolean> {
  await SecureStore.setItemAsync(SETTING_KEY, enabled ? "true" : "false");
  return enabled;
}

/** Webでは予約済み通知が存在しないためno-op。 */
export async function cancelReminderNotifications(): Promise<void> {
  // no-op (web)
}

/** Webではローカル通知のスケジュールに非対応のためno-op。 */
export async function syncMealReminders(_now: Date = new Date()): Promise<void> {
  // no-op (web)
}
