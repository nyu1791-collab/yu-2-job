import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

/**
 * (onboarding)/welcome.tsx
 *
 * 価値訴求カルーセルの簡易版(PLAN.md §4.4)。
 * スワイプライブラリは使わず、「次へ」ボタンでスライドを切り替える簡易実装。
 * 最後のスライドで「目標を設定する」ボタンを表示し、goal/step1へ進む。
 */

interface Slide {
  emoji: string;
  title: string;
  body: string;
}

const SLIDES: Slide[] = [
  {
    emoji: "📷",
    title: "写真を撮るだけ、3秒記録",
    body: "食事の写真を撮るだけで、料理名・グラム・カロリー・PFCをAIが自動で推定します。",
  },
  {
    emoji: "🍱",
    title: "和食・コンビニ商品にも強い",
    body: "定食・丼・コンビニ弁当も、日本食品標準成分表との突合でしっかり栄養計算。",
  },
  {
    emoji: "💪",
    title: "タンパク質残量を最上位に",
    body: "筋トレ・ボディメイク向けのPFC特化UI。今日の残量が一目でわかります。",
  },
];

export default function WelcomeScreen() {
  const [index, setIndex] = useState(0);
  const slide = SLIDES[index]!;
  const isLast = index === SLIDES.length - 1;

  function handleNext() {
    if (isLast) {
      router.push("/(onboarding)/goal/step1");
      return;
    }
    setIndex((i) => Math.min(i + 1, SLIDES.length - 1));
  }

  return (
    <View style={styles.container}>
      <View style={styles.slide}>
        <Text style={styles.emoji}>{slide.emoji}</Text>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.body}>{slide.body}</Text>
      </View>

      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
        ))}
      </View>

      <Pressable style={styles.primaryButton} onPress={handleNext}>
        <Text style={styles.primaryButtonText}>{isLast ? "目標を設定する" : "次へ"}</Text>
      </Pressable>

      {!isLast ? (
        <Pressable style={styles.skipButton} onPress={() => router.push("/(onboarding)/goal/step1")}>
          <Text style={styles.skipButtonText}>スキップ</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "space-between",
    padding: 24,
    paddingTop: 96,
    paddingBottom: 48,
  },
  slide: {
    alignItems: "center",
    gap: 16,
  },
  emoji: {
    fontSize: 72,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    color: "#555",
    textAlign: "center",
    lineHeight: 22,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ddd",
  },
  dotActive: {
    backgroundColor: "#0a7ea4",
  },
  primaryButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  skipButton: {
    marginTop: 12,
    alignItems: "center",
  },
  skipButtonText: {
    color: "#999",
    fontSize: 14,
  },
});
