import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * (onboarding)/paywall.tsx
 *
 * 課金導線のスタブ(M5で実装)。RevenueCat Offerings・7日無料トライアル→
 * 月980円/年6,800円の実装はM5で行う。
 *
 * 現時点では「あとで」でスキップしてホームへ進める。
 */
export default function PaywallScreen() {
  function handleSkip() {
    router.replace("/");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.emoji}>✨</Text>
      <Text style={styles.title}>7日間無料トライアル</Text>
      <Text style={styles.body}>
        トライアル後は月額980円 / 年額6,800円。{"\n"}
        プラン選択機能は近日公開予定です。
      </Text>

      <Pressable style={styles.primaryButton} disabled>
        <Text style={styles.primaryButtonText}>トライアルを開始(近日公開)</Text>
      </Pressable>

      <Pressable style={styles.skipButton} onPress={handleSkip}>
        <Text style={styles.skipButtonText}>あとで</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  emoji: {
    fontSize: 64,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  body: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  primaryButton: {
    backgroundColor: "#ccc",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 32,
    alignItems: "center",
    marginTop: 24,
    width: "100%",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  skipButton: {
    marginTop: 12,
  },
  skipButtonText: {
    color: "#0a7ea4",
    fontSize: 15,
    fontWeight: "600",
  },
});
