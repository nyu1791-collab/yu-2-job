import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  deleteMeal,
  getMealById,
  updateMeal,
  type MealItemRow,
  type MealWithItems,
} from "../../src/lib/api-client";
import { showAlert } from "../../src/lib/alert";

/**
 * meal/[id].tsx — 食事詳細・編集(M4)。
 *
 * - meal + items を表示
 * - 各itemの料理名・グラムを編集できる(編集時はgramsに比例してkcal/PFCを再計算)
 * - 「保存」で PATCH /v1/meals/:id (items差し替え、totalsはサーバ側で再計算)
 * - 「削除」で DELETE /v1/meals/:id (確認ダイアログ) -> 前の画面へ戻る
 */

interface EditableItem {
  name: string;
  grams: string; // TextInput用に文字列で保持
  original: MealItemRow;
}

export default function MealDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const mealId = Number(id);

  const [data, setData] = useState<MealWithItems | null>(null);
  const [items, setItems] = useState<EditableItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getMealById(mealId);
      if (!result) {
        setError("記録が見つかりませんでした。");
        setData(null);
        setItems([]);
        return;
      }
      setData(result);
      setItems(
        result.items.map((item) => ({
          name: item.name,
          grams: String(Math.round(item.grams)),
          original: item,
        })),
      );
    } catch (err) {
      console.error("食事詳細の取得に失敗しました:", err);
      setError("データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, [mealId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function updateItemName(index: number, name: string): void {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, name } : item)));
  }

  function updateItemGrams(index: number, grams: string): void {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, grams } : item)));
  }

  function removeItem(index: number): void {
    setItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSave(): Promise<void> {
    if (!data) return;
    if (items.length === 0) {
      showAlert("エラー", "少なくとも1つの食品が必要です。");
      return;
    }

    setSaving(true);
    try {
      const payloadItems = items.map((item, index) => {
        const grams = Number(item.grams);
        const validGrams = Number.isFinite(grams) && grams > 0 ? grams : item.original.grams;
        const ratio = item.original.grams > 0 ? validGrams / item.original.grams : 1;
        return {
          name: item.name.trim() || item.original.name,
          grams: validGrams,
          kcal: item.original.kcal * ratio,
          protein_g: item.original.proteinG * ratio,
          fat_g: item.original.fatG * ratio,
          carbs_g: item.original.carbsG * ratio,
          confidence: item.original.confidence,
          corrected: item.original.corrected,
          food_db_id: item.original.foodDbId,
          user_edited: true,
          sort_order: index,
        };
      });

      const updated = await updateMeal(data.meal.id, { items: payloadItems });
      setData(updated);
      setItems(
        updated.items.map((item) => ({
          name: item.name,
          grams: String(Math.round(item.grams)),
          original: item,
        })),
      );
      showAlert("保存しました");
    } catch (err) {
      console.error("食事の更新に失敗しました:", err);
      showAlert("エラー", "保存に失敗しました。もう一度お試しください。");
    } finally {
      setSaving(false);
    }
  }

  function handleDelete(): void {
    if (!data) return;
    showAlert("この記録を削除しますか?", "この操作は取り消せません。", [
      { text: "キャンセル", style: "cancel" },
      {
        text: "削除する",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteMeal(data.meal.id);
            router.back();
          } catch (err) {
            console.error("食事の削除に失敗しました:", err);
            showAlert("エラー", "削除に失敗しました。もう一度お試しください。");
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error || !data) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>{error ?? "データがありません。"}</Text>
      </View>
    );
  }

  const total = items.reduce(
    (sum, item) => {
      const grams = Number(item.grams);
      const validGrams = Number.isFinite(grams) && grams > 0 ? grams : item.original.grams;
      const ratio = item.original.grams > 0 ? validGrams / item.original.grams : 1;
      return {
        kcal: sum.kcal + item.original.kcal * ratio,
        protein_g: sum.protein_g + item.original.proteinG * ratio,
        fat_g: sum.fat_g + item.original.fatG * ratio,
        carbs_g: sum.carbs_g + item.original.carbsG * ratio,
      };
    },
    { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 },
  );

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.totalCard}>
        <Text style={styles.totalKcal}>{Math.round(total.kcal)} kcal</Text>
        <Text style={styles.totalPfc}>
          P {Math.round(total.protein_g)}g ・ F {Math.round(total.fat_g)}g ・ C{" "}
          {Math.round(total.carbs_g)}g
        </Text>
        <Text style={styles.mealMeta}>
          {data.meal.eatenOn} {data.meal.eatenAt.slice(0, 5)} ・ {mealTypeLabel(data.meal.mealType)}
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>食品</Text>
        {items.map((item, i) => (
          <View key={item.original.id} style={styles.itemCard}>
            <TextInput
              style={styles.itemNameInput}
              value={item.name}
              onChangeText={(text) => updateItemName(i, text)}
            />
            <View style={styles.itemRow}>
              <TextInput
                style={styles.gramsInput}
                value={item.grams}
                onChangeText={(text) => updateItemGrams(i, text)}
                keyboardType="numeric"
              />
              <Text style={styles.gramsUnit}>g</Text>
              <Pressable style={styles.removeButton} onPress={() => removeItem(i)}>
                <Text style={styles.removeButtonText}>削除</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>

      <Pressable
        style={[styles.saveButton, saving && styles.buttonDisabled]}
        onPress={handleSave}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>{saving ? "保存中…" : "保存する"}</Text>
      </Pressable>

      <Pressable style={styles.deleteButton} onPress={handleDelete}>
        <Text style={styles.deleteButtonText}>この記録を削除する</Text>
      </Pressable>
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
    padding: 16,
    gap: 12,
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  errorText: {
    color: "#e74c3c",
    fontSize: 14,
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
    fontSize: 28,
    fontWeight: "800",
  },
  totalPfc: {
    color: "#e6f4f9",
    fontSize: 14,
    fontWeight: "600",
  },
  mealMeta: {
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
  itemCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#eee",
    gap: 8,
  },
  itemNameInput: {
    fontSize: 15,
    fontWeight: "700",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingVertical: 4,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gramsInput: {
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#eee",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    minWidth: 64,
  },
  gramsUnit: {
    fontSize: 13,
    color: "#666",
  },
  removeButton: {
    marginLeft: "auto",
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  removeButtonText: {
    color: "#e74c3c",
    fontSize: 13,
    fontWeight: "600",
  },
  saveButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 8,
  },
  saveButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  deleteButton: {
    paddingVertical: 12,
    alignItems: "center",
  },
  deleteButtonText: {
    color: "#e74c3c",
    fontSize: 14,
    fontWeight: "600",
  },
});
