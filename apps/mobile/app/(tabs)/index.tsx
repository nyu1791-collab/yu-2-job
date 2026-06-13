import { Link, useFocusEffect } from "expo-router";
import { todayInTokyo } from "@pashacaro/shared";
import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { MacroBar } from "../../src/components/MacroBar";
import { RingCenterLabel, RingProgress } from "../../src/components/RingProgress";
import {
  getDailySummary,
  getMealsByDate,
  type DailySummary,
  type MealWithItems,
} from "../../src/lib/api-client";

/**
 * (tabs)/index.tsx — ホーム(M4)。
 *
 * - 今日のリング: カロリー残量(円形プログレス) + P/F/C残量(横棒)
 * - 食事タイムライン(GET /v1/meals?date=今日)
 * - タブにフォーカスが戻るたびに再取得する(記録確定後にホームへ戻った場合を含む)
 */
export default function HomeScreen() {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [meals, setMeals] = useState<MealWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (showSpinner: boolean) => {
    if (showSpinner) {
      setLoading(true);
    }
    setError(null);
    try {
      const today = todayInTokyo();
      const [summaryRes, mealsRes] = await Promise.all([
        getDailySummary(today),
        getMealsByDate(today),
      ]);
      setSummary(summaryRes);
      setMeals(mealsRes);
    } catch (err) {
      console.error("ホームデータの取得に失敗しました:", err);
      setError("データの取得に失敗しました。");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(meals.length === 0 && summary === null);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  function onRefresh() {
    setRefreshing(true);
    void load(false);
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator />
      </View>
    );
  }

  const totals = summary?.totals ?? { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
  const goal = summary?.goal ?? null;

  const targetKcal = goal?.targetKcal ?? 0;
  const remainingKcal = targetKcal - totals.kcal;
  const kcalProgress = targetKcal > 0 ? totals.kcal / targetKcal : 0;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>パシャカロ</Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {goal ? (
        <View style={styles.ringSection}>
          <RingProgress progress={kcalProgress}>
            <RingCenterLabel
              value={Math.max(0, remainingKcal)}
              unit="kcal"
              label={remainingKcal >= 0 ? "残り" : "超過中"}
            />
          </RingProgress>

          <View style={styles.macroBars}>
            <MacroBar label="P" consumed={totals.protein_g} target={goal.targetProteinG} color="#e74c3c" />
            <MacroBar label="F" consumed={totals.fat_g} target={goal.targetFatG} color="#f1c40f" />
            <MacroBar label="C" consumed={totals.carbs_g} target={goal.targetCarbsG} color="#2ecc71" />
          </View>

          <Text style={styles.totalSummaryText}>
            {Math.round(totals.kcal)} / {Math.round(targetKcal)} kcal 摂取
          </Text>
        </View>
      ) : (
        <View style={styles.noGoalCard}>
          <Text style={styles.noGoalText}>目標が設定されていません。</Text>
          <Link href="/(onboarding)/goal/step1" asChild>
            <View style={styles.linkButton}>
              <Text style={styles.linkButtonText}>目標を設定する</Text>
            </View>
          </Link>
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>今日の食事</Text>
        {meals.length === 0 ? (
          <Text style={styles.emptyText}>まだ記録がありません。撮影タブから記録しましょう。</Text>
        ) : (
          meals
            .slice()
            .sort((a, b) => a.meal.eatenAt.localeCompare(b.meal.eatenAt))
            .map(({ meal, items }) => (
              <Link key={meal.id} href={`/meal/${meal.id}`} asChild>
                <View style={styles.mealRow}>
                  <View style={styles.mealRowHeader}>
                    <Text style={styles.mealTime}>{meal.eatenAt.slice(0, 5)}</Text>
                    <Text style={styles.mealType}>{mealTypeLabel(meal.mealType)}</Text>
                    <Text style={styles.mealKcal}>{Math.round(meal.totalKcal)} kcal</Text>
                  </View>
                  <Text style={styles.mealItems}>{items.map((i) => i.name).join(", ")}</Text>
                </View>
              </Link>
            ))
        )}
      </View>
    </ScrollView>
  );
}

function mealTypeLabel(mealType: string): string {
  switch (mealType) {
    case "breakfast":
      return "朝食";
    case "lunch":
      return "昼食";
    case "dinner":
      return "夕食";
    case "snack":
      return "間食";
    default:
      return "食事";
  }
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    gap: 12,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    marginBottom: 4,
  },
  errorText: {
    color: "#e74c3c",
    fontSize: 13,
  },
  ringSection: {
    alignItems: "center",
    gap: 16,
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#eee",
  },
  macroBars: {
    width: "100%",
    gap: 4,
  },
  totalSummaryText: {
    fontSize: 13,
    color: "#666",
  },
  noGoalCard: {
    alignItems: "center",
    gap: 12,
    backgroundColor: "#f5f5f5",
    borderRadius: 16,
    padding: 20,
  },
  noGoalText: {
    fontSize: 14,
    color: "#666",
  },
  linkButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    backgroundColor: "#0a7ea4",
  },
  linkButtonText: {
    color: "#fff",
    fontWeight: "700",
  },
  section: {
    marginTop: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  emptyText: {
    color: "#999",
    fontSize: 13,
    paddingVertical: 12,
  },
  mealRow: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
    gap: 4,
  },
  mealRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mealTime: {
    fontSize: 13,
    color: "#666",
    fontWeight: "700",
  },
  mealType: {
    fontSize: 13,
    color: "#0a7ea4",
    fontWeight: "700",
    flex: 1,
  },
  mealKcal: {
    fontSize: 14,
    fontWeight: "700",
  },
  mealItems: {
    fontSize: 13,
    color: "#555",
  },
});
