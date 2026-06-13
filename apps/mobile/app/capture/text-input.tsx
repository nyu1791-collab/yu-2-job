import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { analyzeText } from "../../src/lib/api-client";
import { setLastAnalysis } from "../../src/lib/analysis-store";
import { showAlert } from "../../src/lib/alert";

/**
 * capture/text-input.tsx
 *
 * 手動テキスト入力による解析(写真が撮れない/撮りたくない場合の代替フロー)。
 * 入力したテキストを POST /v1/analyze/text に送り、結果を capture/result.tsx で
 * 確認する(写真解析と同じ確認・記録フロー)。
 */
export default function TextInputScreen() {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      showAlert("入力してください", "食事の内容を入力してください。");
      return;
    }

    setSubmitting(true);
    try {
      const response = await analyzeText({ text: trimmed, takenAt: new Date().toISOString() });

      if (!response.ok) {
        if (response.error_kind === "not_food") {
          showAlert("食事の内容が確認できませんでした", "別の表現で入力してみてください。");
          return;
        }
        if (response.error_kind === "rate_limited") {
          const remaining = response.remaining ?? 0;
          showAlert(
            "本日の解析上限に達しました",
            `本日analyzeできる残り回数は${remaining}回です。プランのアップグレードをご検討ください。`,
          );
          return;
        }
        if (response.error_kind === "subscription_required") {
          showAlert(
            "プランへの登録が必要です",
            "この機能を利用するには、プランへの登録(7日間無料トライアル)が必要です。",
            [{ text: "OK", onPress: () => router.replace("/(onboarding)/paywall") }],
          );
          return;
        }
        showAlert("エラー", response.message);
        return;
      }

      setLastAnalysis(response.analysis, { analysisLogId: response.analysisLogId, source: "text" });
      router.replace("/capture/result");
    } catch (err) {
      console.error("テキスト解析に失敗しました:", err);
      const detail = err instanceof Error ? err.message : String(err);
      showAlert("エラー", `解析リクエストに失敗しました。もう一度お試しください。\n\n(詳細: ${detail})`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>食事を入力</Text>
      <Text style={styles.subtitle}>
        食べたものを文章で入力してください。例: 「ご飯と鶏の唐揚げ3個、味噌汁」
      </Text>

      <TextInput
        style={styles.textArea}
        value={text}
        onChangeText={setText}
        placeholder="食べたものを入力…"
        multiline
        numberOfLines={6}
        editable={!submitting}
      />

      <Pressable
        style={[styles.submitButton, submitting && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <View style={styles.submitButtonContent}>
            <ActivityIndicator color="#fff" />
            <Text style={styles.submitButtonText}>解析しています…</Text>
          </View>
        ) : (
          <Text style={styles.submitButtonText}>解析する</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 24,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  subtitle: {
    fontSize: 13,
    color: "#666",
  },
  textArea: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    minHeight: 140,
    textAlignVertical: "top",
  },
  submitButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 16,
    paddingVertical: 18,
    alignItems: "center",
  },
  submitButtonContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  submitButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});
