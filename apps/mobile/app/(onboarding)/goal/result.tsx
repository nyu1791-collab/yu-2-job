import { calculateGoal, recalculateGoalWithKcal } from "@pashacaro/shared";
import { Redirect, router } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { isDraftComplete, setCalculatedGoal, useGoalStore } from "../../../src/lib/goal-store";

/**
 * (onboarding)/goal/result.tsx
 *
 * sharedのgoal-calcでPFC目標を計算して提示。target_kcalを微調整(±50kcal)できる。
 * 微調整時はP(タンパク質)を固定し、F=25%・残りをCとして再計算する
 * (sharedの`recalculateGoalWithKcal`で、goal-calc本体と同じ比率を維持)。
 *
 * 「次へ」でsign-in.tsxへ進む。サインイン完了後にPUT /v1/me/goalで保存する
 * (goal-storeのcalculatedに保持した値をtargetKcalOverrideとして送信する)。
 */

const ADJUST_STEP_KCAL = 50;

export default function GoalResultScreen() {
  const { draft } = useGoalStore();
  const [adjustedKcal, setAdjustedKcal] = useState<number | null>(null);

  const base = useMemo(() => {
    if (!isDraftComplete(draft)) {
      return null;
    }
    return calculateGoal(draft);
  }, [draft]);

  const result = useMemo(() => {
    if (!base) return null;
    if (adjustedKcal === null) return base;
    return recalculateGoalWithKcal(base, adjustedKcal);
  }, [base, adjustedKcal]);

  // ステートレスな直接リロード(in-memoryストアが空)では、空のViewで止まらず
  // welcome画面へ宣言的にリダイレクトしてクリーンに再スタートする。
  if (!base || !result) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  function adjust(delta: number) {
    const current = adjustedKcal ?? base!.targetKcal;
    setAdjustedKcal(Math.max(1000, current + delta));
  }

  function handleNext() {
    setCalculatedGoal(result);
    router.push("/(onboarding)/sign-in");
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>あなたの目標PFC</Text>
      <Text style={styles.subtitle}>
        基礎代謝(BMR) {Math.round(result.bmr)} kcal ・ 消費量(TDEE) {Math.round(result.tdee)} kcal
      </Text>

      <View style={styles.kcalCard}>
        <Text style={styles.kcalLabel}>目標カロリー</Text>
        <View style={styles.kcalAdjustRow}>
          <Pressable style={styles.adjustButton} onPress={() => adjust(-ADJUST_STEP_KCAL)}>
            <Text style={styles.adjustButtonText}>-{ADJUST_STEP_KCAL}</Text>
          </Pressable>
          <Text style={styles.kcalValue}>{Math.round(result.targetKcal)}</Text>
          <Pressable style={styles.adjustButton} onPress={() => adjust(ADJUST_STEP_KCAL)}>
            <Text style={styles.adjustButtonText}>+{ADJUST_STEP_KCAL}</Text>
          </Pressable>
        </View>
        <Text style={styles.kcalUnit}>kcal / 日</Text>
      </View>

      <View style={styles.pfcRow}>
        <PfcCard label="P" value={result.targetProteinG} unit="g" color="#e74c3c" />
        <PfcCard label="F" value={result.targetFatG} unit="g" color="#f1c40f" />
        <PfcCard label="C" value={result.targetCarbsG} unit="g" color="#2ecc71" />
      </View>

      <Text style={styles.note}>
        ※ タンパク質(P)は体重×2.0gで固定し、脂質(F)は総カロリーの25%、残りを炭水化物(C)としています。
        微調整は後からホーム画面の設定からも可能です。
      </Text>

      <Pressable style={styles.primaryButton} onPress={handleNext}>
        <Text style={styles.primaryButtonText}>この目標で始める</Text>
      </Pressable>
    </View>
  );
}

function PfcCard({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <View style={styles.pfcCard}>
      <View style={[styles.pfcBadge, { backgroundColor: color }]}>
        <Text style={styles.pfcBadgeText}>{label}</Text>
      </View>
      <Text style={styles.pfcValue}>
        {Math.round(value)}
        <Text style={styles.pfcUnit}>{unit}</Text>
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
  },
  kcalCard: {
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 4,
  },
  kcalLabel: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
  kcalAdjustRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginVertical: 8,
  },
  kcalValue: {
    fontSize: 40,
    fontWeight: "800",
    minWidth: 120,
    textAlign: "center",
  },
  kcalUnit: {
    fontSize: 12,
    color: "#999",
  },
  adjustButton: {
    borderWidth: 1,
    borderColor: "#0a7ea4",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  adjustButtonText: {
    color: "#0a7ea4",
    fontWeight: "700",
  },
  pfcRow: {
    flexDirection: "row",
    gap: 12,
  },
  pfcCard: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 16,
    padding: 16,
    alignItems: "center",
    gap: 8,
  },
  pfcBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  pfcBadgeText: {
    color: "#fff",
    fontWeight: "800",
  },
  pfcValue: {
    fontSize: 22,
    fontWeight: "800",
  },
  pfcUnit: {
    fontSize: 13,
    fontWeight: "400",
    color: "#888",
  },
  note: {
    fontSize: 12,
    color: "#999",
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: "auto",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
});
