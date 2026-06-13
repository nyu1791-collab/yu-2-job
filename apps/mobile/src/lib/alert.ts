import { Alert, Platform } from "react-native";

export interface AlertButton {
  text?: string;
  onPress?: () => void;
  style?: "default" | "cancel" | "destructive";
}

/**
 * Alert.alert() の薄いラッパー。
 *
 * react-native-web の Alert.alert は完全なno-op(何も表示せず、onPressも
 * 呼ばれない)ため、Web版ではエラー時にユーザーへ何のフィードバックも
 * 届かず「ボタンを押しても反応しない」ように見えてしまう。
 * Webでは window.alert / window.confirm にフォールバックすることで、
 * メッセージ表示とボタンのonPressが実行されるようにする。
 *
 * - buttonsなし・1個: window.alert() 表示後、(あれば)そのonPressを呼ぶ
 * - 2個以上: window.confirm() で確認し、OK -> cancel以外のボタンのonPress、
 *   キャンセル -> styleが"cancel"のボタンのonPress
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== "web") {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length <= 1) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }

  if (window.confirm(text)) {
    const button = buttons.find((b) => b.style !== "cancel") ?? buttons[0];
    button?.onPress?.();
  } else {
    buttons.find((b) => b.style === "cancel")?.onPress?.();
  }
}
