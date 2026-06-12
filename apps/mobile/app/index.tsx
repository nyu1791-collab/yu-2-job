import { Link } from "expo-router";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useAnalysisStore } from "../src/lib/analysis-store";

/**
 * 最小のホーム画面(M1版)。
 *
 * タブなし。撮影ボタンと最後の解析結果(あれば)を表示する。
 * M4で今日のリング・タイムラインに置き換える。
 */
export default function HomeScreen() {
  const { lastAnalysis, recordedMeals } = useAnalysisStore();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>パシャカロ</Text>
      <Text style={styles.subtitle}>写真を撮るだけで3秒記録</Text>

      <Link href="/capture/camera" asChild>
        <View style={styles.captureButton}>
          <Text style={styles.captureButtonText}>📷 食事を撮影する</Text>
        </View>
      </Link>

      {recordedMeals.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>記録済みの食事(ローカル)</Text>
          {recordedMeals.map((meal) => (
            <View key={meal.id} style={styles.mealRow}>
              <Text style={styles.mealRowText}>
                {new Date(meal.recordedAt).toLocaleTimeString("ja-JP")} ・{" "}
                {meal.analysis.dishes.map((d) => d.name).join(", ")} ・{" "}
                {Math.round(meal.analysis.total.kcal)} kcal
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {lastAnalysis ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>最後の解析結果</Text>
          <View style={styles.lastAnalysisCard}>
            <Text style={styles.lastAnalysisKcal}>
              {Math.round(lastAnalysis.total.kcal)} kcal
            </Text>
            <Text style={styles.lastAnalysisPfc}>
              P {Math.round(lastAnalysis.total.protein_g)}g ・ F{" "}
              {Math.round(lastAnalysis.total.fat_g)}g ・ C{" "}
              {Math.round(lastAnalysis.total.carbs_g)}g
            </Text>
            {lastAnalysis.dishes.map((dish, i) => (
              <Text key={i} style={styles.dishName}>
                ・{dish.name}
              </Text>
            ))}
          </View>
          <Link href="/capture/result" asChild>
            <View style={styles.linkButton}>
              <Text style={styles.linkButtonText}>結果カードをもう一度見る</Text>
            </View>
          </Link>
        </View>
      ) : (
        <Text style={styles.emptyText}>まだ解析結果がありません。撮影してみましょう。</Text>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  captureButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    marginBottom: 8,
  },
  captureButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  section: {
    marginTop: 24,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  mealRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  mealRowText: {
    fontSize: 14,
  },
  lastAnalysisCard: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 16,
    gap: 4,
  },
  lastAnalysisKcal: {
    fontSize: 24,
    fontWeight: "700",
  },
  lastAnalysisPfc: {
    fontSize: 14,
    color: "#333",
  },
  dishName: {
    fontSize: 14,
    marginTop: 4,
  },
  linkButton: {
    marginTop: 8,
    paddingVertical: 12,
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#0a7ea4",
  },
  linkButtonText: {
    color: "#0a7ea4",
    fontWeight: "600",
  },
  emptyText: {
    marginTop: 24,
    color: "#999",
    textAlign: "center",
  },
});
