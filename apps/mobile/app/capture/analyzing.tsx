import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Easing, StyleSheet, Text, View } from "react-native";
import { analyzePhoto, type AnalyzeResponse } from "../../src/lib/api-client";
import { clearPendingImage, getPendingImage } from "../../src/lib/pending-image-store";
import { setLastAnalysis } from "../../src/lib/analysis-store";

/**
 * capture/analyzing.tsx
 *
 * 「解析中」演出(3秒)を表示しつつ、並行してAPIに解析リクエストを送る。
 * - 3秒の演出と解析処理(レスポンス)の両方が完了したら result.tsx へ遷移する
 *   (3秒未満でレスポンスが返っても、最低3秒は演出を見せる)
 * - エラー時はアラートを表示し、camera.tsx に戻る
 */
export default function AnalyzingScreen() {
  const spinValue = useRef(new Animated.Value(0)).current;
  const [statusText, setStatusText] = useState("写真を解析しています…");

  useEffect(() => {
    const spinAnimation = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    spinAnimation.start();

    let cancelled = false;

    const MIN_DISPLAY_MS = 3000;
    const start = Date.now();

    async function run(): Promise<void> {
      const pending = getPendingImage();
      if (!pending) {
        if (!cancelled) {
          Alert.alert("エラー", "解析する画像が見つかりませんでした。");
          router.replace("/capture/camera");
        }
        return;
      }

      let response: AnalyzeResponse;
      try {
        response = await analyzePhoto({
          imageBase64: pending.base64,
          mediaType: pending.mediaType,
          takenAt: new Date().toISOString(),
        });
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          Alert.alert("エラー", "解析リクエストに失敗しました。もう一度お試しください。");
          router.replace("/capture/camera");
        }
        return;
      }

      const elapsed = Date.now() - start;
      const remaining = Math.max(0, MIN_DISPLAY_MS - elapsed);

      await new Promise((resolve) => setTimeout(resolve, remaining));
      if (cancelled) return;

      if (!response.ok) {
        clearPendingImage();
        if (response.error_kind === "not_food") {
          Alert.alert(
            "食事が写っていないようです",
            "再撮影するか、手動で入力してください。",
            [{ text: "OK", onPress: () => router.replace("/capture/camera") }],
          );
          return;
        }
        if (response.error_kind === "parse_failed") {
          Alert.alert(
            "うまく解析できませんでした",
            "再試行するか、手動で入力してください。",
            [{ text: "OK", onPress: () => router.replace("/capture/camera") }],
          );
          return;
        }
        if (response.error_kind === "rate_limited") {
          Alert.alert("本日の解析上限に達しました", "プランのアップグレードをご検討ください。", [
            { text: "OK", onPress: () => router.replace("/capture/camera") },
          ]);
          return;
        }
        Alert.alert("エラー", response.message, [
          { text: "OK", onPress: () => router.replace("/capture/camera") },
        ]);
        return;
      }

      setLastAnalysis(response.analysis, { analysisLogId: response.analysisLogId, source: "photo" });
      clearPendingImage();
      router.replace("/capture/result");
    }

    setStatusText("写真を解析しています…");
    void run();

    return () => {
      cancelled = true;
      spinAnimation.stop();
    };
  }, [spinValue]);

  const rotate = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.spinner, { transform: [{ rotate }] }]}>
        <Text style={styles.spinnerEmoji}>🍽️</Text>
      </Animated.View>
      <Text style={styles.title}>{statusText}</Text>
      <Text style={styles.subtitle}>料理名・グラム・PFCを推定しています</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0a7ea4",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 24,
  },
  spinner: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.15)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 8,
  },
  spinnerEmoji: {
    fontSize: 48,
  },
  title: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  subtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    textAlign: "center",
  },
});
