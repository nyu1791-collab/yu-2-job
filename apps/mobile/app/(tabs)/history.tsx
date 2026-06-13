import { Link, useFocusEffect } from "expo-router";
import { addDaysToDateString, todayInTokyo } from "@pashacaro/shared";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  getDailySummary,
  getMealsByDate,
  getWeeklySummary,
  type DailySummary,
  type MealWithItems,
  type WeeklySummary,
} from "../../src/lib/api-client";

/**
 * (tabs)/history.tsx — 履歴(M4)。
 *
 * - 日付ナビゲーション(前日/翌日+日付表示)で日別タイムライン
 * - 週次サマリー(GET /v1/summary/weekly: 平均PFC・達成日数)
 *
 * 週次サマリーは選択中の日付を含む週(その日を起点に7日間)を表示する。
 */
export default function HistoryScreen() {
  const [date, setDate] = useState(() => todayInTokyo());
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [meals, setMeals] = useState<MealWithItems[]>([]);
  const [weekly, setWeekly] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (targetDate: string) => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, mealsRes, weeklyRes] = await Promise.all([
        getDailySummary(targetDate),
        getMealsByDate(targetDate),
        getWeeklySummary(targetDate),
      ]);
      setSummary(summaryRes);
      setMeals(mealsRes);
      setWeekly(weeklyRes);
    } catch (err) {
      console.error("履歴データの取得に失敗しました:", err);
      setError("データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load(date);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [date]),
  );

  function goToPreviousDay() {
    setDate((d) => addDaysToDateString(d, -1));
  }

  function goToNextDay() {
    setDate((d) => addDaysToDateString(d, 1));
  }

  const today = todayInTokyo();
  const isToday = date === today;
  const totals = summary?.totals ?? { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>履歴</Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      <View style={styles.dateNav}>
        <Pressable style={styles.navButton} onPress={goToPreviousDay}>
          <Text style={styles.navButtonText}>‹ 前日</Text>
        </Pressable>
        <Text style={styles.dateText}>
          {formatDateLabel(date)}
          {isToday ? "(今日)" : ""}
        </Text>
        <Pressable style={styles.navButton} onPress={goToNextDay} disabled={date >= today}>
          <Text style={[styles.navButtonText, date >= today && styles.navButtonDisabled]}>翌日 ›</Text>
        </Pressable>
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          <View style={styles.totalsCard}>
            <Text style={styles.totalsKcal}>{Math.round(totals.kcal)} kcal</Text>
            <Text style={styles.totalsPfc}>
              P {Math.round(totals.protein_g)}g ・ F {Math.round(totals.fat_g)}g ・ C{" "}
              {Math.round(totals.carbs_g)}g
            </Text>
            {summary?.goal ? (
              <Text style={styles.goalText}>
                目標 {Math.round(summary.goal.targetKcal)} kcal (P {Math.round(summary.goal.targetProteinG)}g)
              </Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>食事</Text>
            {meals.length === 0 ? (
              <Text style={styles.emptyText}>この日の記録はありません。</Text>
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

          {weekly ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>週次サマリー({formatDateLabel(weekly.start)}〜)</Text>
              <View style={styles.weeklyCard}>
                <Text style={styles.weeklyAchieved}>
                  達成日数: {weekly.achievedDays} / 7日(記録あり {weekly.recordedDays}日)
                </Text>
                <Text style={styles.weeklyAverages}>
                  平均 {Math.round(weekly.averages.kcal)} kcal ・ P {Math.round(weekly.averages.protein_g)}g
                  ・ F {Math.round(weekly.averages.fat_g)}g ・ C {Math.round(weekly.averages.carbs_g)}g
                </Text>
                <View style={styles.weeklyDaysRow}>
                  {weekly.days.map((day) => (
                    <View key={day.date} style={styles.weeklyDayCell}>
                      <Text style={styles.weeklyDayLabel}>{day.date.slice(8, 10)}</Text>
                      <View
                        style={[
                          styles.weeklyDayDot,
                          day.totals === null
                            ? styles.weeklyDayDotEmpty
                            : day.achieved
                              ? styles.weeklyDayDotAchieved
                              : styles.weeklyDayDotMissed,
                        ]}
                      />
                    </View>
                  ))}
                </View>
              </View>
            </View>
          ) : null}
        </>
      )}
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

/** "YYYY-MM-DD" -> "M月D日" 表示。 */
function formatDateLabel(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return date;
  const [, , month, day] = match;
  return `${Number(month)}月${Number(day)}日`;
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    gap: 12,
  },
  centerContainer: {
    paddingVertical: 40,
    alignItems: "center",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  errorText: {
    color: "#e74c3c",
    fontSize: 13,
  },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
  },
  navButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  navButtonText: {
    color: "#0a7ea4",
    fontWeight: "700",
    fontSize: 14,
  },
  navButtonDisabled: {
    color: "#ccc",
  },
  dateText: {
    fontSize: 16,
    fontWeight: "700",
  },
  totalsCard: {
    backgroundColor: "#0a7ea4",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 4,
  },
  totalsKcal: {
    color: "#fff",
    fontSize: 28,
    fontWeight: "800",
  },
  totalsPfc: {
    color: "#e6f4f9",
    fontSize: 14,
    fontWeight: "600",
  },
  goalText: {
    color: "#e6f4f9",
    fontSize: 12,
    marginTop: 4,
  },
  section: {
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
  weeklyCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#eee",
    gap: 8,
  },
  weeklyAchieved: {
    fontSize: 14,
    fontWeight: "700",
  },
  weeklyAverages: {
    fontSize: 13,
    color: "#555",
  },
  weeklyDaysRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  weeklyDayCell: {
    alignItems: "center",
    gap: 4,
  },
  weeklyDayLabel: {
    fontSize: 11,
    color: "#888",
  },
  weeklyDayDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  weeklyDayDotEmpty: {
    backgroundColor: "#eee",
  },
  weeklyDayDotAchieved: {
    backgroundColor: "#2ecc71",
  },
  weeklyDayDotMissed: {
    backgroundColor: "#f1c40f",
  },
});
