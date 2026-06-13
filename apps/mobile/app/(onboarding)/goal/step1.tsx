import type { GoalType } from "@pashacaro/shared";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { setGoalType, useGoalStore } from "../../../src/lib/goal-store";

/**
 * (onboarding)/goal/step1.tsx
 *
 * 目標設定ウィザード 1/2: 減量/維持/増量(PLAN.md §4.3 goal-calc の goalType)。
 */

interface GoalOption {
  type: GoalType;
  label: string;
  description: string;
  emoji: string;
}

const OPTIONS: GoalOption[] = [
  { type: "cut", label: "減量", description: "TDEEから-300kcal", emoji: "📉" },
  { type: "maintain", label: "維持", description: "TDEEを維持", emoji: "⚖️" },
  { type: "bulk", label: "増量", description: "TDEEから+250kcal", emoji: "📈" },
];

export default function GoalStep1Screen() {
  const { draft } = useGoalStore();

  function handleSelect(goalType: GoalType) {
    setGoalType(goalType);
    router.push("/(onboarding)/goal/step2");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>あなたの目標は?</Text>
      <Text style={styles.subtitle}>目標に合わせてカロリー・PFCの目安を計算します。</Text>

      <View style={styles.options}>
        {OPTIONS.map((opt) => {
          const selected = draft.goalType === opt.type;
          return (
            <Pressable
              key={opt.type}
              style={[styles.option, selected && styles.optionSelected]}
              onPress={() => handleSelect(opt.type)}
            >
              <Text style={styles.optionEmoji}>{opt.emoji}</Text>
              <View style={styles.optionTextGroup}>
                <Text style={styles.optionLabel}>{opt.label}</Text>
                <Text style={styles.optionDescription}>{opt.description}</Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 16,
  },
  options: {
    gap: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 16,
    padding: 18,
  },
  optionSelected: {
    borderColor: "#0a7ea4",
    backgroundColor: "#eaf6fa",
  },
  optionEmoji: {
    fontSize: 32,
  },
  optionTextGroup: {
    gap: 2,
  },
  optionLabel: {
    fontSize: 18,
    fontWeight: "700",
  },
  optionDescription: {
    fontSize: 13,
    color: "#666",
  },
});
