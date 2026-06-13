import { Redirect, Stack, usePathname } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { loadAuthFromStorage, useAuthState } from "../src/lib/auth-store";

/**
 * ルートレイアウト(M4版)。
 *
 * 起動時に loadAuthFromStorage() でexpo-secure-storeからトークンを復元し、
 * - 未サインイン(accessTokenなし) -> (onboarding) へリダイレクト
 * - サインイン済みなのに (onboarding) 配下にいる -> ホーム((tabs))へリダイレクト
 * という最小限のルートガードを行う。
 *
 * M4でホームをタブレイアウト((tabs))化したため、ホームのルートは
 * "/(tabs)" (= (tabs)/index.tsx) になる。
 *
 * entitlement(課金状態)によるpaywallガードはM5で追加する。
 */
export default function RootLayout() {
  const auth = useAuthState();
  const pathname = usePathname();

  useEffect(() => {
    loadAuthFromStorage();
  }, []);

  if (auth.isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  const inOnboarding = pathname.startsWith("/welcome") || pathname.startsWith("/goal") || pathname.startsWith("/sign-in") || pathname.startsWith("/paywall");

  if (!auth.accessToken && !inOnboarding) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  if (auth.accessToken && inOnboarding) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="capture/camera" options={{ title: "撮影", headerShown: false }} />
        <Stack.Screen
          name="capture/analyzing"
          options={{ title: "解析中", headerShown: false, gestureEnabled: false }}
        />
        <Stack.Screen name="capture/result" options={{ title: "解析結果" }} />
        <Stack.Screen name="capture/text-input" options={{ title: "テキストで入力" }} />
        <Stack.Screen name="meal/[id]" options={{ title: "食事の詳細" }} />
        <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}
