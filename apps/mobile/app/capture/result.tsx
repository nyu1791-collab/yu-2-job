import { router } from "expo-router";
import { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { nowTimeInTokyo, scalePortion, todayInTokyo, PORTION_SCALE_MAX, PORTION_SCALE_MIN } from "@pashacaro/shared";
import type { Analysis, CorrectedAnalysis, Dish } from "@pashacaro/shared";
import { createMeal, type MealItemPayload } from "../../src/lib/api-client";
import { setLastAnalysis, useAnalysisStore, type StoredAnalysis } from "../../src/lib/analysis-store";

/**
 * capture/result.tsx
 *
 * 解析結果カード。
 * - dishごとのPFC/kcal/confidenceバッジ
 * - 分量スライダー(0.5x〜2.0x、ステップ0.1)で線形再計算(sharedの scalePortion を使用)
 * - 料理名修正(タップでテキスト入力に切り替え)
 * - 「記録する」で POST /v1/meals に保存し、ホーム((tabs))へ戻る
 */

const PORTION_STEP = 0.1;

type Dishes = (CorrectedAnalysis | Analysis)["dishes"];

/**
 * Dish (estimated_grams) を scalePortion (grams) の形に変換して再計算し、
 * 結果を再び estimated_grams に戻すアダプタ。
 */
function scaleDish<T extends Dishes[number]>(dish: T, scale: number): T {
  const scaled = scalePortion(
    {
      grams: dish.estimated_grams,
      kcal: dish.kcal,
      protein_g: dish.protein_g,
      fat_g: dish.fat_g,
      carbs_g: dish.carbs_g,
    },
    scale,
  );

  return {
    ...dish,
    estimated_grams: scaled.grams,
    kcal: scaled.kcal,
    protein_g: scaled.protein_g,
    fat_g: scaled.fat_g,
    carbs_g: scaled.carbs_g,
  };
}

function confidenceLabel(confidence: number): { text: string; style: "high" | "mid" | "low" } {
  if (confidence >= 0.7) return { text: `確信度 ${Math.round(confidence * 100)}%`, style: "high" };
  if (confidence >= 0.5) return { text: `確信度 ${Math.round(confidence * 100)}%`, style: "mid" };
  return { text: `⚠ 確信度 ${Math.round(confidence * 100)}%`, style: "low" };
}

export default function ResultScreen() {
  const { lastAnalysis, lastAnalysisLogId, lastAnalysisSource } = useAnalysisStore();

  const initialDishes = lastAnalysis?.dishes ?? [];

  // dishごとの分量スケール(0.5〜2.0)
  const [scales, setScales] = useState<number[]>(() => initialDishes.map(() => 1));
  // dishごとの料理名(編集可能)
  const [names, setNames] = useState<string[]>(() => initialDishes.map((d) => d.name));
  // 編集中のdish index
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const hasLowConfidence = initialDishes.some((d) => d.confidence < 0.5);

  const scaledDishes = useMemo(() => {
    return initialDishes.map((dish, i) => {
      const scale = scales[i] ?? 1;
      const name = names[i] ?? dish.name;
      return scaleDish({ ...dish, name }, scale);
    });
  }, [initialDishes, scales, names]);

  const total = useMemo(() => {
    return scaledDishes.reduce(
      (sum, d) => ({
        kcal: sum.kcal + d.kcal,
        protein_g: sum.protein_g + d.protein_g,
        fat_g: sum.fat_g + d.fat_g,
        carbs_g: sum.carbs_g + d.carbs_g,
      }),
      { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
    );
  }, [scaledDishes]);

  if (!lastAnalysis) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>解析結果がありません。</Text>
        <Pressable style={styles.primaryButton} onPress={() => router.replace("/(tabs)")}>
          <Text style={styles.primaryButtonText}>ホームへ戻る</Text>
        </Pressable>
      </View>
    );
  }

  function updateScale(index: number, delta: number): void {
    setScales((prev) => {
      const next = [...prev];
      const current = next[index] ?? 1;
      const raw = Math.round((current + delta) * 10) / 10;
      const clamped = Math.min(PORTION_SCALE_MAX, Math.max(PORTION_SCALE_MIN, raw));
      next[index] = clamped;
      return next;
    });
  }

  function updateName(index: number, name: string): void {
    setNames((prev) => {
      const next = [...prev];
      next[index] = name;
      return next;
    });
  }

  async function handleRecord(): Promise<void> {
    const recordedAnalysis = {
      ...lastAnalysis,
      dishes: scaledDishes,
      total,
    } as StoredAnalysis;

    const items: MealItemPayload[] = scaledDishes.map((dish, i) => {
      const corrected = "corrected" in dish ? Boolean((dish as { corrected?: boolean }).corrected) : false;
      const matchedProductId =
        "matched_product_id" in dish
          ? ((dish as { matched_product_id?: number | null }).matched_product_id ?? null)
          : null;
      return {
        name: dish.name,
        grams: dish.estimated_grams,
        kcal: dish.kcal,
        protein_g: dish.protein_g,
        fat_g: dish.fat_g,
        carbs_g: dish.carbs_g,
        confidence: dish.confidence,
        corrected,
        food_db_id: matchedProductId,
        user_edited: names[i] !== initialDishes[i]?.name || (scales[i] ?? 1) !== 1,
        sort_order: i,
      };
    });

    const mealType = lastAnalysis?.meal_type ?? "unknown";

    setSaving(true);
    try {
      await createMeal({
        analysisLogId: lastAnalysisLogId,
        eatenOn: todayInTokyo(),
        eatenAt: nowTimeInTokyo(),
        mealType,
        source: lastAnalysisSource ?? "photo",
        items,
      });

      setLastAnalysis(recordedAnalysis);

      router.replace("/(tabs)");
    } catch (err) {
      console.error("食事の記録に失敗しました:", err);
      Alert.alert("エラー", "記録に失敗しました。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.totalCard}>
        <Text style={styles.totalKcal}>{Math.round(total.kcal)} kcal</Text>
        <Text style={styles.totalPfc}>
          P {Math.round(total.protein_g)}g ・ F {Math.round(total.fat_g)}g ・ C{" "}
          {Math.round(total.carbs_g)}g
        </Text>
        {lastAnalysis.meal_type !== "unknown" ? (
          <Text style={styles.mealType}>{mealTypeLabel(lastAnalysis.meal_type)}</Text>
        ) : null}
      </View>

      {hasLowConfidence ? (
        <View style={styles.warningBanner}>
          <Text style={styles.warningText}>
            ⚠ 推定精度が低めの料理があります。分量や料理名を確認してください。
          </Text>
        </View>
      ) : null}

      {lastAnalysis.notes ? (
        <View style={styles.notesCard}>
          <Text style={styles.notesText}>{lastAnalysis.notes}</Text>
        </View>
      ) : null}

      {scaledDishes.map((dish, i) => {
        const scale = scales[i] ?? 1;
        const badge = confidenceLabel(dish.confidence);
        const isEditing = editingIndex === i;

        return (
          <View key={i} style={styles.dishCard}>
            <View style={styles.dishHeader}>
              {isEditing ? (
                <TextInput
                  style={styles.dishNameInput}
                  value={names[i] ?? dish.name}
                  onChangeText={(text) => updateName(i, text)}
                  onBlur={() => setEditingIndex(null)}
                  autoFocus
                />
              ) : (
                <Pressable onPress={() => setEditingIndex(i)} style={styles.dishNameTouchable}>
                  <Text style={styles.dishName}>{dish.name}</Text>
                  <Text style={styles.editHint}>✎</Text>
                </Pressable>
              )}
              <View
                style={[
                  styles.confidenceBadge,
                  badge.style === "high" && styles.confidenceHigh,
                  badge.style === "mid" && styles.confidenceMid,
                  badge.style === "low" && styles.confidenceLow,
                ]}
              >
                <Text style={styles.confidenceBadgeText}>{badge.text}</Text>
              </View>
            </View>

            <Text style={styles.dishKcal}>{Math.round(dish.kcal)} kcal</Text>
            <Text style={styles.dishPfc}>
              P {dish.protein_g.toFixed(1)}g ・ F {dish.fat_g.toFixed(1)}g ・ C{" "}
              {dish.carbs_g.toFixed(1)}g ・ {Math.round(dish.estimated_grams)}g
            </Text>

            <View style={styles.portionRow}>
              <Text style={styles.portionLabel}>分量</Text>
              <Pressable
                style={styles.portionButton}
                onPress={() => updateScale(i, -PORTION_STEP)}
                disabled={scale <= PORTION_SCALE_MIN}
              >
                <Text style={styles.portionButtonText}>−</Text>
              </Pressable>
              <Text style={styles.portionValue}>{scale.toFixed(1)}x</Text>
              <Pressable
                style={styles.portionButton}
                onPress={() => updateScale(i, PORTION_STEP)}
                disabled={scale >= PORTION_SCALE_MAX}
              >
                <Text style={styles.portionButtonText}>＋</Text>
              </Pressable>
            </View>
          </View>
        );
      })}

      <Pressable
        style={[styles.recordButton, saving && styles.buttonDisabled]}
        onPress={handleRecord}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.recordButtonText}>記録する</Text>
        )}
      </Pressable>

      <Pressable
        style={styles.secondaryButton}
        onPress={() => router.replace("/capture/camera")}
        disabled={saving}
      >
        <Text style={styles.secondaryButtonText}>もう一度撮影する</Text>
      </Pressable>
    </ScrollView>
  );
}

function mealTypeLabel(mealType: Analysis["meal_type"]): string {
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
      return "";
  }
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 16,
    gap: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    color: "#666",
  },
  totalCard: {
    backgroundColor: "#0a7ea4",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 4,
  },
  totalKcal: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "800",
  },
  totalPfc: {
    color: "#e6f4f9",
    fontSize: 16,
    fontWeight: "600",
  },
  mealType: {
    color: "#e6f4f9",
    fontSize: 13,
    marginTop: 4,
  },
  warningBanner: {
    backgroundColor: "#fff4e5",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#ffcc80",
  },
  warningText: {
    color: "#a35a00",
    fontSize: 13,
  },
  notesCard: {
    backgroundColor: "#f5f5f5",
    borderRadius: 12,
    padding: 12,
  },
  notesText: {
    color: "#444",
    fontSize: 13,
  },
  dishCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: "#eee",
  },
  dishHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  dishNameTouchable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexShrink: 1,
  },
  dishName: {
    fontSize: 17,
    fontWeight: "700",
  },
  editHint: {
    fontSize: 13,
    color: "#999",
  },
  dishNameInput: {
    fontSize: 17,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: "#0a7ea4",
    flex: 1,
    paddingVertical: 2,
  },
  confidenceBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  confidenceHigh: {
    backgroundColor: "#e3f6e8",
  },
  confidenceMid: {
    backgroundColor: "#fff4e5",
  },
  confidenceLow: {
    backgroundColor: "#fde8e8",
  },
  confidenceBadgeText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#333",
  },
  dishKcal: {
    fontSize: 20,
    fontWeight: "700",
  },
  dishPfc: {
    fontSize: 13,
    color: "#555",
  },
  portionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 4,
  },
  portionLabel: {
    fontSize: 13,
    color: "#666",
    marginRight: 4,
  },
  portionButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  portionButtonText: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0a7ea4",
  },
  portionValue: {
    fontSize: 15,
    fontWeight: "700",
    minWidth: 48,
    textAlign: "center",
  },
  recordButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
    marginTop: 8,
  },
  recordButtonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  primaryButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#0a7ea4",
    fontSize: 14,
    fontWeight: "600",
  },
});
