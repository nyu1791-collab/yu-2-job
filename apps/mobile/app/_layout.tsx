import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

/**
 * ルートレイアウト(M1版)。
 *
 * M3で未サインイン -> (onboarding) / entitlement無 -> paywall のルートガードを追加する。
 * 現時点ではホーム画面とcapture/*のスタックのみ。
 */
export default function RootLayout() {
  return (
    <>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="index" options={{ title: "パシャカロ" }} />
        <Stack.Screen name="capture/camera" options={{ title: "撮影", headerShown: false }} />
        <Stack.Screen
          name="capture/analyzing"
          options={{ title: "解析中", headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen name="capture/result" options={{ title: "解析結果" }} />
      </Stack>
    </>
  );
}
