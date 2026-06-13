import { Stack } from "expo-router";

/**
 * オンボーディングのスタックレイアウト(M3)。
 *
 * 順序: welcome -> goal/step1 -> goal/step2 -> goal/result -> sign-in -> (paywallはM5でスキップ可能なスタブ)
 */
export default function OnboardingLayout() {
  return (
    <Stack>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="goal/step1" options={{ title: "目標", headerBackTitle: "戻る" }} />
      <Stack.Screen name="goal/step2" options={{ title: "あなたについて", headerBackTitle: "戻る" }} />
      <Stack.Screen name="goal/result" options={{ title: "目標PFC", headerBackTitle: "戻る" }} />
      <Stack.Screen name="paywall" options={{ title: "プラン選択", headerBackTitle: "戻る" }} />
      <Stack.Screen name="sign-in" options={{ title: "サインイン", headerBackTitle: "戻る" }} />
    </Stack>
  );
}
