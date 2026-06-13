import { Redirect, Stack, usePathname } from "expo-router";
import type { ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, AppState, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { getDevToken } from "../src/lib/api-client";
import { loadAuthFromStorage, useAuthState } from "../src/lib/auth-store";
import { syncMealReminders } from "../src/lib/notifications";

/**
 * Webデモのデバッグ補助: 起動時/実行時に未捕捉のJSエラーが発生すると画面が
 * 真っ白になり原因が分からないため、Webでは window のエラーを画面上の
 * オーバーレイ(赤背景の<pre>)に出力する。これにより端末のスクショから
 * 実際のエラー内容を確認できる。Web以外(iOS/Android)では何もしない。
 */
if (Platform.OS === "web" && typeof window !== "undefined" && typeof document !== "undefined") {
  const showError = (label: string, detail: unknown) => {
    const message =
      detail instanceof Error
        ? `${detail.message}\n\n${detail.stack ?? ""}`
        : typeof detail === "string"
          ? detail
          : (() => {
              try {
                return JSON.stringify(detail);
              } catch {
                return String(detail);
              }
            })();
    let el = document.getElementById("__pashacaro_err");
    if (!el) {
      el = document.createElement("pre");
      el.id = "__pashacaro_err";
      el.style.cssText =
        "position:fixed;inset:0;z-index:99999;margin:0;padding:16px;background:#1a0000;color:#ff9d9d;font:12px/1.6 ui-monospace,monospace;white-space:pre-wrap;word-break:break-word;overflow:auto;";
      document.body.appendChild(el);
    }
    el.textContent = `${el.textContent ?? ""}[${label}] ${message}\n\n`;
  };
  window.addEventListener("error", (e) => showError("error", e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) =>
    showError("unhandledrejection", (e as PromiseRejectionEvent).reason),
  );
}

/**
 * expo-routerのErrorBoundary。配下のルートのレンダリングで例外が発生した場合に
 * 真っ白画面の代わりにエラー内容を表示する(本番ビルドでも有効)。
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#1a0000" }}
      contentContainerStyle={{ padding: 20, paddingTop: 60 }}
    >
      <Text style={{ color: "#ff9d9d", fontSize: 16, fontWeight: "700", marginBottom: 12 }}>
        エラーが発生しました
      </Text>
      <Text style={{ color: "#ffd6d6", fontSize: 12, fontFamily: "monospace", marginBottom: 20 }}>
        {`${error.message}\n\n${error.stack ?? ""}`}
      </Text>
      <Pressable
        onPress={retry}
        style={{ backgroundColor: "#ff5252", paddingVertical: 12, borderRadius: 8, alignItems: "center" }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>再試行</Text>
      </Pressable>
    </ScrollView>
  );
}

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

  // 食事記録リマインダー(M6): 起動時 + フォアグラウンド復帰時に
  // 当日の記録状況を確認し、ローカル通知を再スケジュールする。
  // (ベストエフォート方式。詳細は src/lib/notifications.ts のコメント参照)
  useEffect(() => {
    void syncMealReminders();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncMealReminders();
      }
    });
    return () => subscription.remove();
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
