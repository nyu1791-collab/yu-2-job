import type { ActivityLevel, Sex } from "@pashacaro/shared";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { isDraftComplete, setGoalProfile, useGoalStore } from "../../../src/lib/goal-store";

/**
 * (onboarding)/goal/step2.tsx
 *
 * 目標設定ウィザード 2/2: 性別・年齢・身長・体重・活動量(PLAN.md §4.3 goal-calc の入力)。
 */

const SEX_OPTIONS: { value: Sex; label: string }[] = [
  { value: "male", label: "男性" },
  { value: "female", label: "女性" },
];

const ACTIVITY_OPTIONS: { value: ActivityLevel; label: string; description: string }[] = [
  { value: "sedentary", label: "座り仕事中心", description: "ほぼ運動しない" },
  { value: "light", label: "軽い運動", description: "週1〜3回" },
  { value: "moderate", label: "中程度の運動", description: "週3〜5回" },
  { value: "active", label: "激しい運動", description: "週6〜7回" },
];

export default function GoalStep2Screen() {
  const { draft } = useGoalStore();

  const [sex, setSex] = useState<Sex | null>(draft.sex);
  const [age, setAge] = useState(draft.age ? String(draft.age) : "");
  const [heightCm, setHeightCm] = useState(draft.heightCm ? String(draft.heightCm) : "");
  const [weightKg, setWeightKg] = useState(draft.weightKg ? String(draft.weightKg) : "");
  const [activityLevel, setActivityLevel] = useState<ActivityLevel | null>(draft.activityLevel);

  useEffect(() => {
    if (!draft.goalType) {
      router.replace("/(onboarding)/goal/step1");
    }
  }, [draft.goalType]);

  function handleNext() {
    const ageNum = Number(age);
    const heightNum = Number(heightCm);
    const weightNum = Number(weightKg);

    if (!sex || !activityLevel || !age || !heightCm || !weightKg) {
      Alert.alert("入力エラー", "すべての項目を入力してください。");
      return;
    }
    if (!Number.isFinite(ageNum) || ageNum <= 0 || ageNum > 120) {
      Alert.alert("入力エラー", "年齢を正しく入力してください。");
      return;
    }
    if (!Number.isFinite(heightNum) || heightNum <= 0 || heightNum > 300) {
      Alert.alert("入力エラー", "身長を正しく入力してください。");
      return;
    }
    if (!Number.isFinite(weightNum) || weightNum <= 0 || weightNum > 500) {
      Alert.alert("入力エラー", "体重を正しく入力してください。");
      return;
    }

    setGoalProfile({ sex, age: ageNum, heightCm: heightNum, weightKg: weightNum, activityLevel });

    const next = { ...draft, sex, age: ageNum, heightCm: heightNum, weightKg: weightNum, activityLevel };
    if (!isDraftComplete(next)) {
      Alert.alert("入力エラー", "入力内容を確認してください。");
      return;
    }

    router.push("/(onboarding)/goal/result");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>あなたについて教えてください</Text>
      <Text style={styles.subtitle}>基礎代謝・目標カロリーの計算に使用します。</Text>

      <Text style={styles.label}>性別</Text>
      <View style={styles.row}>
        {SEX_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.choice, sex === opt.value && styles.choiceSelected]}
            onPress={() => setSex(opt.value)}
          >
            <Text style={[styles.choiceText, sex === opt.value && styles.choiceTextSelected]}>{opt.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>年齢</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        placeholder="例: 30"
        value={age}
        onChangeText={setAge}
      />

      <Text style={styles.label}>身長 (cm)</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        placeholder="例: 170"
        value={heightCm}
        onChangeText={setHeightCm}
      />

      <Text style={styles.label}>体重 (kg)</Text>
      <TextInput
        style={styles.input}
        keyboardType="decimal-pad"
        placeholder="例: 65"
        value={weightKg}
        onChangeText={setWeightKg}
      />

      <Text style={styles.label}>活動量</Text>
      <View style={styles.activityOptions}>
        {ACTIVITY_OPTIONS.map((opt) => (
          <Pressable
            key={opt.value}
            style={[styles.activityOption, activityLevel === opt.value && styles.choiceSelected]}
            onPress={() => setActivityLevel(opt.value)}
          >
            <Text
              style={[styles.choiceText, activityLevel === opt.value && styles.choiceTextSelected]}
            >
              {opt.label}
            </Text>
            <Text style={styles.activityDescription}>{opt.description}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.primaryButton} onPress={handleNext}>
        <Text style={styles.primaryButtonText}>次へ</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#fff",
    padding: 24,
    gap: 4,
    paddingBottom: 48,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 16,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    gap: 12,
  },
  choice: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  choiceSelected: {
    borderColor: "#0a7ea4",
    backgroundColor: "#eaf6fa",
  },
  choiceText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#333",
  },
  choiceTextSelected: {
    color: "#0a7ea4",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  activityOptions: {
    gap: 8,
  },
  activityOption: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  activityDescription: {
    fontSize: 12,
    color: "#888",
    marginTop: 2,
  },
  primaryButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 32,
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});
