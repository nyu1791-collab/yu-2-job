import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { clearAuthTokens, useAuthState } from "../../src/lib/auth-store";
import { getMe, getMyGoal, type GoalRow, type MeProfile } from "../../src/lib/api-client";
import { getNotificationsEnabled, setNotificationsEnabled, syncMealReminders } from "../../src/lib/notifications";
import { showAlert } from "../../src/lib/alert";

const GOAL_TYPE_LABELS: Record<GoalRow["goalType"], string> = {
  cut: "減量",
  maintain: "維持",
  bulk: "増量",
};

/**
 * (tabs)/settings.tsx — 設定(M4)。
 *
 * - 現在の目標(PFC・カロリー)を表示
 * - 目標を再計算(オンボーディングの目標設定ウィザードへ再度遷移)
 * - ログアウト
 */
export default function SettingsScreen() {
  const auth = useAuthState();
  const [profile, setProfile] = useState<MeProfile | null>(null);
  const [goal, setGoal] = useState<GoalRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabledState] = useState(false);
  const [notificationsBusy, setNotificationsBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [profileRes, goalRes, notificationsEnabledRes] = await Promise.all([
        getMe(),
        getMyGoal(),
        getNotificationsEnabled(),
      ]);
      setProfile(profileRes);
      setGoal(goalRes);
      setNotificationsEnabledState(notificationsEnabledRes);
    } catch (err) {
      console.error("設定データの取得に失敗しました:", err);
      setError("データの取得に失敗しました。");
    } finally {
      setLoading(false);
    }
  }, []);

  async function handleToggleNotifications(value: boolean): Promise<void> {
    setNotificationsBusy(true);
    try {
      const applied = await setNotificationsEnabled(value);
      setNotificationsEnabledState(applied);
      if (value && !applied) {
        showAlert(
          "通知が許可されていません",
          "端末の設定アプリから通知を許可してください。",
        );
      }
      await syncMealReminders();
    } catch (err) {
      console.error("通知設定の更新に失敗しました:", err);
      showAlert("通知設定の更新に失敗しました。");
    } finally {
      setNotificationsBusy(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function handleRecalculate(): void {
    router.push("/(onboarding)/goal/step1");
  }

  function handleLogout(): void {
    showAlert("ログアウトしますか?", undefined, [
      { text: "キャンセル", style: "cancel" },
      {
        text: "ログアウト",
        style: "destructive",
        onPress: async () => {
          await clearAuthTokens();
          router.replace("/(onboarding)/welcome");
        },
      },
    ]);
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>設定</Text>

      {error ? <Text style={styles.errorText}>{error}</Text> : null}

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>アカウント</Text>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>メールアドレス</Text>
              <Text style={styles.cardValue}>{profile?.email ?? auth.userId ?? "-"}</Text>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>目標</Text>
            {goal ? (
              <View style={styles.card}>
                <Text style={styles.goalKcal}>{Math.round(goal.targetKcal)} kcal</Text>
                <Text style={styles.goalPfc}>
                  P {Math.round(goal.targetProteinG)}g ・ F {Math.round(goal.targetFatG)}g ・ C{" "}
                  {Math.round(goal.targetCarbsG)}g
                </Text>
                <Text style={styles.goalMeta}>
                  {GOAL_TYPE_LABELS[goal.goalType]} ・ 体重 {goal.weightKg}kg ・ 身長 {goal.heightCm}cm ・
                  {goal.age}歳
                </Text>
                <Text style={styles.goalMeta}>適用開始: {goal.effectiveFrom}</Text>
              </View>
            ) : (
              <View style={styles.card}>
                <Text style={styles.cardValue}>目標が設定されていません。</Text>
              </View>
            )}
            <Pressable style={styles.actionButton} onPress={handleRecalculate}>
              <Text style={styles.actionButtonText}>目標を再計算する</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>通知</Text>
            <View style={styles.card}>
              <View style={styles.notificationRow}>
                <View style={styles.notificationTextContainer}>
                  <Text style={styles.cardValue}>食事記録のリマインダー</Text>
                  <Text style={styles.goalMeta}>
                    記録が無い日は12:30・19:30頃にお知らせします。
                  </Text>
                </View>
                <Switch
                  value={notificationsEnabled}
                  onValueChange={(value) => void handleToggleNotifications(value)}
                  disabled={notificationsBusy}
                />
              </View>
            </View>
          </View>

          <View style={styles.section}>
            <Pressable style={styles.logoutButton} onPress={handleLogout}>
              <Text style={styles.logoutButtonText}>ログアウト</Text>
            </Pressable>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    gap: 16,
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
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#eee",
    gap: 4,
  },
  cardLabel: {
    fontSize: 12,
    color: "#888",
  },
  cardValue: {
    fontSize: 15,
    fontWeight: "600",
  },
  goalKcal: {
    fontSize: 24,
    fontWeight: "800",
  },
  goalPfc: {
    fontSize: 14,
    color: "#333",
  },
  goalMeta: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
  },
  notificationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  notificationTextContainer: {
    flex: 1,
    gap: 4,
  },
  actionButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  actionButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  logoutButton: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e74c3c",
  },
  logoutButtonText: {
    color: "#e74c3c",
    fontWeight: "700",
    fontSize: 15,
  },
});
