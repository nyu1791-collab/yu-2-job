import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as SecureStore from "./secure-store";
import { computeReminderFireTimes, todayInTokyo } from "@pashacaro/shared";
import { getMealsByDate } from "./api-client";

/**
 * ローカル通知(食事記録リマインダー、M6 / PLAN.md §4.6)。
 *
 * - Asia/Tokyo 12:30 / 19:30 にリマインダーを送る。
 * - 「その日の食事が1件も記録されていない」場合のみスケジュールする。
 * - 厳密なバックグラウンドcronではなく、アプリのフォアグラウンド復帰/起動時に
 *   `syncMealReminders()` を呼んで都度スケジュールを再計算するベストエフォート方式。
 *   (expo-notifications のローカル通知は端末側で発火するため、アプリが
 *   フォアグラウンドに来ていない期間でも一度スケジュールされた通知自体は届くが、
 *   「当日記録済みになったので通知をキャンセルする」処理はフォアグラウンド復帰時のみ行われる。
 *   このトレードオフは許容する。)
 *
 * ON/OFFの設定値は `expo-secure-store` に保存する(このプロジェクトは既に
 * 認証トークンの永続化に expo-secure-store を使っており、AsyncStorageを
 * 新規依存として追加せずに済むため)。
 */

const SETTING_KEY = "pashacaro.notificationsEnabled";

const REMINDER_NOTIFICATION_IDS_KEY = "pashacaro.reminderNotificationIds";

const REMINDER_MESSAGES = ["お昼の記録を忘れていませんか?", "今日の食事を記録しましょう"];

// 通知タップ時にフォアグラウンドでも表示する(Expo SDK 53+の新APIに合わせる)。
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** 通知ON/OFF設定を読み込む(未設定時はfalse=OFF)。 */
export async function getNotificationsEnabled(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(SETTING_KEY);
  return value === "true";
}

/**
 * 通知ON/OFF設定を保存する。
 *
 * - ONにする場合は `Notifications.requestPermissionsAsync()` で権限をリクエストする。
 *   権限が許可されなかった場合は設定をONにせず、falseを返す。
 * - OFFにする場合は予約済みのリマインダーをすべてキャンセルする。
 *
 * @returns 実際に設定された値(権限拒否時はfalseになることがある)。
 */
export async function setNotificationsEnabled(enabled: boolean): Promise<boolean> {
  if (enabled) {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") {
      await SecureStore.setItemAsync(SETTING_KEY, "false");
      return false;
    }
    await SecureStore.setItemAsync(SETTING_KEY, "true");
    return true;
  }

  await SecureStore.setItemAsync(SETTING_KEY, "false");
  await cancelReminderNotifications();
  return false;
}

async function getStoredNotificationIds(): Promise<string[]> {
  const raw = await SecureStore.getItemAsync(REMINDER_NOTIFICATION_IDS_KEY);
  if (!raw) {
    return [];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

async function storeNotificationIds(ids: string[]): Promise<void> {
  await SecureStore.setItemAsync(REMINDER_NOTIFICATION_IDS_KEY, JSON.stringify(ids));
}

/** 予約済みのリマインダー通知をすべてキャンセルする。 */
export async function cancelReminderNotifications(): Promise<void> {
  // Web版ではローカル通知のスケジュール機能(expo-notifications)が利用できないため、
  // 何もせずに既存の予約IDのみクリアする(クラッシュを避ける)。
  if (Platform.OS === "web") {
    await storeNotificationIds([]);
    return;
  }
  const ids = await getStoredNotificationIds();
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id)));
  await storeNotificationIds([]);
}

/**
 * 今日の食事記録状況を確認し、リマインダー通知を再スケジュールする。
 *
 * - 通知設定がOFFの場合は何もしない(既存の予約があればキャンセルする)。
 * - 当日の食事が1件以上記録されている場合は、既存の予約をキャンセルする。
 * - 当日の食事が無い場合は、12:30/19:30(Asia/Tokyo, 既に過ぎていれば翌日)の
 *   リマインダーを再スケジュールする(まず既存の予約をキャンセルしてから再設定する)。
 *
 * アプリのフォアグラウンド復帰・起動時に呼ぶことを想定する。
 */
export async function syncMealReminders(now: Date = new Date()): Promise<void> {
  // Web版ではローカル通知のスケジュール機能(expo-notifications)が利用できないため、
  // リマインダーの再スケジュールは行わない(クラッシュを避けるためのno-op)。
  if (Platform.OS === "web") {
    return;
  }

  const enabled = await getNotificationsEnabled();
  if (!enabled) {
    await cancelReminderNotifications();
    return;
  }

  let hasMealToday = false;
  try {
    const meals = await getMealsByDate(todayInTokyo(now));
    hasMealToday = meals.length > 0;
  } catch (err) {
    // 取得失敗時はスケジュールを変更しない(誤ってキャンセルし続けることを避ける)。
    console.error("通知用の食事記録取得に失敗しました:", err);
    return;
  }

  await cancelReminderNotifications();

  if (hasMealToday) {
    return;
  }

  const fireTimes = computeReminderFireTimes(false, now);
  const ids: string[] = [];
  for (let i = 0; i < fireTimes.length; i++) {
    const fireTime = fireTimes[i]!;
    const body = REMINDER_MESSAGES[i % REMINDER_MESSAGES.length]!;
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "パシャカロ",
        body,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireTime,
      },
    });
    ids.push(id);
  }
  await storeNotificationIds(ids);
}
