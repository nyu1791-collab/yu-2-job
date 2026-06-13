import * as AppleAuthentication from "expo-apple-authentication";
import * as Google from "expo-auth-session/providers/google";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import {
  getDevToken,
  signInWithApple,
  signInWithGoogle,
  updateMyGoal,
  updateRcAppUserId,
  type AuthResponse,
} from "../../src/lib/api-client";
import { setAuthTokens } from "../../src/lib/auth-store";
import { useGoalStore } from "../../src/lib/goal-store";
import { logInRevenueCat } from "../../src/lib/purchases";

WebBrowser.maybeCompleteAuthSession();

/**
 * (onboarding)/sign-in.tsx
 *
 * Apple/Googleサインインボタン + devトークンでスキップ(実機なし環境向け)。
 *
 * サインイン成功後、goal-storeに保持しているcalculated(目標PFC)があれば
 * PUT /v1/me/goal で保存し、ホーム(/)へ遷移する。
 */
/**
 * 現在のプラットフォームに対応するGoogle OAuthクライアントIDが設定されているか。
 *
 * expo-auth-session の `Google.useIdTokenAuthRequest` は、そのプラットフォーム用の
 * クライアントID(web: webClientId)が未設定だとフック呼び出し時に同期的に例外を投げる。
 * 特にWebデモではクライアントID未設定が通常運用のため、未設定時はGoogleボタン
 * (= フックを呼ぶ子コンポーネント)自体をレンダリングしないことでクラッシュを防ぐ。
 */
const googleClientIdForPlatform =
  Platform.OS === "ios"
    ? process.env["EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"]
    : Platform.OS === "android"
      ? process.env["EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID"]
      : process.env["EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"];

/**
 * Googleサインインボタン。`Google.useIdTokenAuthRequest` をこの子コンポーネント内で
 * 呼ぶことで、クライアントID未設定時は親がこのコンポーネントを描画しない(=フックが
 * 走らない)選択肢を取れるようにしている(フックは条件分岐できないため)。
 */
function GoogleSignInButton({
  isLoading,
  setIsLoading,
  onSignedIn,
}: {
  isLoading: boolean;
  setIsLoading: (value: boolean) => void;
  onSignedIn: (response: AuthResponse) => Promise<void>;
}) {
  // Google: EXPO_PUBLIC_GOOGLE_*_CLIENT_ID は本番でEAS環境変数として設定する想定。
  const [, googleResponse, promptGoogleAsync] = Google.useIdTokenAuthRequest({
    iosClientId: process.env["EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID"],
    androidClientId: process.env["EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID"],
    webClientId: process.env["EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"],
  });

  async function handleGoogleSignIn() {
    setIsLoading(true);
    try {
      const result = await promptGoogleAsync();
      if (result.type !== "success") {
        return;
      }
      const idToken = result.params["id_token"];
      if (!idToken) {
        Alert.alert("サインインに失敗しました", "id_tokenが取得できませんでした。");
        return;
      }
      const response = await signInWithGoogle(idToken);
      await onSignedIn(response);
    } catch (err) {
      console.error(err);
      Alert.alert("サインインに失敗しました", "もう一度お試しください。");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <Pressable style={styles.googleButton} onPress={handleGoogleSignIn} disabled={isLoading}>
        <Text style={styles.googleButtonText}>Googleでサインイン</Text>
      </Pressable>

      {googleResponse?.type === "error" ? (
        <Text style={styles.errorText}>Googleサインインでエラーが発生しました。</Text>
      ) : null}
    </>
  );
}

export default function SignInScreen() {
  const { calculated, draft } = useGoalStore();
  const [isLoading, setIsLoading] = useState(false);

  async function finishSignIn(response: AuthResponse) {
    if (!response.ok) {
      Alert.alert("サインインに失敗しました", response.message);
      return;
    }

    await setAuthTokens({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      userId: response.user.id,
    });

    await saveGoalIfNeeded();
    await syncRevenueCatAppUserId(response.user.id);
    router.replace("/(onboarding)/paywall");
  }

  /**
   * RevenueCatの匿名ユーザーをサーバのuserIdへエイリアス統合する(PLAN.md §4.5 M5)。
   *
   * - `Purchases.logIn(userId)` でRevenueCat側のapp_user_idをuserIdに切り替え、
   *   その結果(originalAppUserId)を `PUT /v1/me/rc-app-user-id` でサーバへ保存する。
   * - EXPO_PUBLIC_RC_API_KEY未設定(RevenueCat未接続環境)では `logInRevenueCat` がnullを返すため、
   *   何もしない。
   * - 失敗してもオンボーディングは継続する(paywall側でdevスキップ等のフォールバックがある)。
   */
  async function syncRevenueCatAppUserId(userId: string) {
    try {
      const rcAppUserId = await logInRevenueCat(userId);
      if (!rcAppUserId) {
        return;
      }
      await updateRcAppUserId(rcAppUserId);
    } catch (err) {
      console.error("RevenueCat app_user_idの同期に失敗しました:", err);
    }
  }

  /** goal-storeに微調整済みの目標があれば PUT /v1/me/goal で保存する。 */
  async function saveGoalIfNeeded() {
    if (!calculated || !draft.goalType || !draft.sex || !draft.age || !draft.heightCm || !draft.weightKg || !draft.activityLevel) {
      return;
    }
    try {
      await updateMyGoal({
        goalType: draft.goalType,
        weightKg: draft.weightKg,
        heightCm: draft.heightCm,
        age: draft.age,
        sex: draft.sex,
        activityLevel: draft.activityLevel,
        targetKcalOverride: calculated.targetKcal,
      });
    } catch (err) {
      console.error("目標の保存に失敗しました:", err);
      // 保存失敗してもオンボーディングは進める(ホームから再設定できる)
    }
  }

  async function handleAppleSignIn() {
    setIsLoading(true);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        Alert.alert("サインインに失敗しました", "identityTokenが取得できませんでした。");
        return;
      }
      const response = await signInWithApple(credential.identityToken);
      await finishSignIn(response);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "ERR_REQUEST_CANCELED") {
        return;
      }
      console.error(err);
      Alert.alert("サインインに失敗しました", "もう一度お試しください。");
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * devビルド用: EXPO_PUBLIC_DEV_TOKEN をアクセストークンとしてそのまま保存し、
   * devユーザー(DEV_USER_ID)としてAPIを使えるようにする。
   * requireAuth() はこのトークンをDEV_TOKENとして認識する。
   * リフレッシュトークンは持たない(devトークンに有効期限がないため)。
   */
  async function handleDevTokenSkip() {
    const devToken = getDevToken();
    if (!devToken) {
      Alert.alert(
        "devトークンが設定されていません",
        "EXPO_PUBLIC_DEV_TOKEN を .env に設定してください。",
      );
      return;
    }
    setIsLoading(true);
    try {
      await setAuthTokens({ accessToken: devToken, refreshToken: "", userId: "dev" });
      await saveGoalIfNeeded();
      await syncRevenueCatAppUserId("dev");
      router.replace("/(onboarding)/paywall");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>サインインして始めましょう</Text>
      <Text style={styles.subtitle}>記録を保存し、複数の端末で同期できるようにします。</Text>

      {isLoading ? <ActivityIndicator style={styles.spinner} /> : null}

      {Platform.OS === "ios" ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={16}
          style={styles.appleButton}
          onPress={handleAppleSignIn}
        />
      ) : null}

      {googleClientIdForPlatform ? (
        <GoogleSignInButton
          isLoading={isLoading}
          setIsLoading={setIsLoading}
          onSignedIn={finishSignIn}
        />
      ) : null}

      {getDevToken() ? (
        <Pressable style={styles.devButton} onPress={handleDevTokenSkip} disabled={isLoading}>
          <Text style={styles.devButtonText}>devトークンでスキップ(開発用)</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    justifyContent: "center",
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
  },
  spinner: {
    marginBottom: 12,
  },
  appleButton: {
    width: "100%",
    height: 50,
  },
  googleButton: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  googleButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
  },
  errorText: {
    color: "#e74c3c",
    fontSize: 12,
    textAlign: "center",
  },
  devButton: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#999",
    borderStyle: "dashed",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  devButtonText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
});
