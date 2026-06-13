import { Redirect, Stack, usePathname } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { getDevToken } from "../src/lib/api-client";
import { loadAuthFromStorage, useAuthState } from "../src/lib/auth-store";

/**
 * ルートレイアウト(M5版)。
 *
 * 起動時に loadAuthFromStorage() でexpo-secure-storeからトークンを復元し、
 * - 未サインイン(accessTokenなし) -> (onboarding) へリダイレクト
 * - サインイン済みなのに (onboarding) 配下にいる(paywallを除く) -> ホーム((tabs))へリダイレクト
 * - サインイン済みだがentitlementなし(かつdevトークンでもない) -> paywallへリダイレクト
 * という最小限のルートガードを行う。
 *
 * M4でホームをタブレイアウト((tabs))化したため、ホームのルートは
 * "/(tabs)" (= (tabs)/index.tsx) になる。
 *
 * entitlement(課金状態)によるpaywallガード(M5):
 * - loadAuthFromStorage() がサインイン済みの場合に内部で fetchEntitlement() を呼ぶため、
 *   auth.entitlement が undefined の間(取得中)はガード判定を保留する。
 * - devトークンでサインインしている場合(userId === "dev")はAPI側のentitlementゲートを
 *   バイパスする設計と揃え、paywallガードもバイパスする。
 * - entitled === false の場合のみpaywallへリダイレクトする。
 *   取得失敗(entitlement === null)の場合はガードをブロックしない(オフライン時等に
 *   アプリが使えなくなることを避ける)。
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
  const inPaywall = pathname.startsWith("/paywall");

  if (!auth.accessToken && !inOnboarding) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  const isDevTokenUser = auth.accessToken === getDevToken();

  if (auth.accessToken && !isDevTokenUser && auth.entitlement?.entitled === false && !inPaywall) {
    return <Redirect href="/(onboarding)/paywall" />;
  }

  if (auth.accessToken && inOnboarding && !(inPaywall && auth.entitlement?.entitled === false && !isDevTokenUser)) {
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
