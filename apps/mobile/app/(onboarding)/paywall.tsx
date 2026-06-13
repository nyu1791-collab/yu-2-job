import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { PurchasesOffering, PurchasesPackage } from "react-native-purchases";
import {
  getCurrentOffering,
  isPurchasesConfigured,
  purchasePackage,
  restorePurchases,
} from "../../src/lib/purchases";
import { showAlert } from "../../src/lib/alert";
import { fetchEntitlement } from "../../src/lib/auth-store";

/**
 * (onboarding)/paywall.tsx (M5)
 *
 * RevenueCat Offeringsを取得し、月額/年額の2択 + 7日間無料トライアル訴求 + 購入/復元ボタンを表示する。
 *
 * - `EXPO_PUBLIC_RC_API_KEY` 未設定時(実機・ストア接続なし環境向け):
 *   Offeringsを取得せず、「devスキップ」ボタンのみを表示するフォールバックUIにする
 *   (開発を止めないためのPLAN.md §4.5 M5の方針)。
 * - 購入成功後は entitlement を再取得してから `/(tabs)` へ遷移する。
 *   サインインは既にこの画面より前(sign-in.tsx)で完了している前提。
 */

const TERMS_URL = "https://example.com/pashacaro/terms";
const PRIVACY_URL = "https://example.com/pashacaro/privacy";

export default function PaywallScreen() {
  const [offering, setOffering] = useState<PurchasesOffering | null>(null);
  const [selectedPackage, setSelectedPackage] = useState<PurchasesPackage | null>(null);
  const [loadingOfferings, setLoadingOfferings] = useState(true);
  const [isPurchasing, setIsPurchasing] = useState(false);

  const rcConfigured = isPurchasesConfigured();

  useEffect(() => {
    if (!rcConfigured) {
      setLoadingOfferings(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const current = await getCurrentOffering();
      if (cancelled) return;
      setOffering(current);
      // デフォルト選択: 年額(annual)。無ければ月額(monthly)。
      const defaultPkg = current?.annual ?? current?.monthly ?? current?.availablePackages[0] ?? null;
      setSelectedPackage(defaultPkg);
      setLoadingOfferings(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [rcConfigured]);

  async function goToHomeAfterEntitlementCheck() {
    await fetchEntitlement();
    router.replace("/(tabs)");
  }

  async function handlePurchase() {
    if (!selectedPackage) {
      return;
    }
    setIsPurchasing(true);
    try {
      const result = await purchasePackage(selectedPackage);
      if (result.cancelled) {
        return;
      }
      if (!result.ok) {
        showAlert("購入に失敗しました", result.message ?? "もう一度お試しください。");
        return;
      }
      await goToHomeAfterEntitlementCheck();
    } finally {
      setIsPurchasing(false);
    }
  }

  async function handleRestore() {
    setIsPurchasing(true);
    try {
      const result = await restorePurchases();
      if (!result.ok || !result.entitled) {
        showAlert("復元できる購入が見つかりませんでした", "購入済みの場合は同じApple ID/Googleアカウントでお試しください。");
        return;
      }
      await goToHomeAfterEntitlementCheck();
    } finally {
      setIsPurchasing(false);
    }
  }

  /** devビルド用: RevenueCat未接続環境でオンボーディングを完了できるようにする。 */
  function handleDevSkip() {
    router.replace("/(tabs)");
  }

  // EXPO_PUBLIC_RC_API_KEY 未設定: devスキップのみのフォールバックUI
  if (!rcConfigured) {
    return (
      <View style={styles.container}>
        <Text style={styles.emoji}>✨</Text>
        <Text style={styles.title}>7日間無料トライアル</Text>
        <Text style={styles.body}>
          トライアル後は月額980円 / 年額6,800円。{"\n"}
          {Platform.OS === "web"
            ? "デモ版(Web)では購入機能は利用できません。続行ボタンでアプリのUIを確認できます。"
            : "この環境ではRevenueCatが設定されていないため、\ndevスキップで進めます。"}
        </Text>

        <Pressable style={styles.devButton} onPress={handleDevSkip}>
          <Text style={styles.devButtonText}>
            {Platform.OS === "web" ? "続行(Webデモ)" : "devスキップ(開発用)"}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (loadingOfferings) {
    return (
      <View style={styles.container}>
        <ActivityIndicator />
        <Text style={styles.body}>プラン情報を取得しています…</Text>
      </View>
    );
  }

  const monthly = offering?.monthly ?? null;
  const annual = offering?.annual ?? null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.emoji}>✨</Text>
      <Text style={styles.title}>7日間無料トライアル</Text>
      <Text style={styles.body}>
        まずは7日間無料でお試しください。{"\n"}
        トライアル終了後に自動で課金が開始されます(いつでも解約可能)。
      </Text>

      <View style={styles.planList}>
        {monthly ? (
          <PlanOption
            label="月額プラン"
            priceLabel={monthly.product.priceString}
            badge={null}
            selected={selectedPackage?.identifier === monthly.identifier}
            onPress={() => setSelectedPackage(monthly)}
          />
        ) : null}
        {annual ? (
          <PlanOption
            label="年額プラン"
            priceLabel={annual.product.priceString}
            badge="2ヶ月分お得"
            selected={selectedPackage?.identifier === annual.identifier}
            onPress={() => setSelectedPackage(annual)}
          />
        ) : null}
        {!monthly && !annual ? (
          <Text style={styles.body}>現在、購入可能なプランがありません。しばらくしてから再度お試しください。</Text>
        ) : null}
      </View>

      <Pressable
        style={[styles.primaryButton, (!selectedPackage || isPurchasing) && styles.primaryButtonDisabled]}
        disabled={!selectedPackage || isPurchasing}
        onPress={handlePurchase}
      >
        {isPurchasing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryButtonText}>7日間無料トライアルを開始</Text>
        )}
      </Pressable>

      <Pressable style={styles.restoreButton} onPress={handleRestore} disabled={isPurchasing}>
        <Text style={styles.restoreButtonText}>購入を復元</Text>
      </Pressable>

      <View style={styles.legalLinks}>
        <Pressable onPress={() => Linking.openURL(TERMS_URL)}>
          <Text style={styles.legalLinkText}>利用規約</Text>
        </Pressable>
        <Text style={styles.legalSeparator}>・</Text>
        <Pressable onPress={() => Linking.openURL(PRIVACY_URL)}>
          <Text style={styles.legalLinkText}>プライバシーポリシー</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

interface PlanOptionProps {
  label: string;
  priceLabel: string;
  badge: string | null;
  selected: boolean;
  onPress: () => void;
}

function PlanOption({ label, priceLabel, badge, selected, onPress }: PlanOptionProps) {
  return (
    <Pressable style={[styles.planOption, selected && styles.planOptionSelected]} onPress={onPress}>
      <View style={styles.planOptionHeader}>
        <Text style={styles.planOptionLabel}>{label}</Text>
        {badge ? (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        ) : null}
      </View>
      <Text style={styles.planOptionPrice}>{priceLabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: "#fff",
    padding: 24,
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
  },
  emoji: {
    fontSize: 64,
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
  },
  body: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },
  planList: {
    width: "100%",
    gap: 12,
    marginTop: 8,
  },
  planOption: {
    width: "100%",
    borderWidth: 2,
    borderColor: "#eee",
    borderRadius: 16,
    padding: 16,
  },
  planOptionSelected: {
    borderColor: "#0a7ea4",
    backgroundColor: "#eaf6fa",
  },
  planOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  planOptionLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  planOptionPrice: {
    fontSize: 14,
    color: "#333",
    marginTop: 4,
  },
  badge: {
    backgroundColor: "#ff9500",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "700",
  },
  primaryButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 32,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
    width: "100%",
  },
  primaryButtonDisabled: {
    backgroundColor: "#ccc",
  },
  primaryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  restoreButton: {
    marginTop: 12,
  },
  restoreButtonText: {
    color: "#0a7ea4",
    fontSize: 15,
    fontWeight: "600",
  },
  legalLinks: {
    flexDirection: "row",
    marginTop: 24,
    alignItems: "center",
  },
  legalLinkText: {
    color: "#999",
    fontSize: 12,
    textDecorationLine: "underline",
  },
  legalSeparator: {
    color: "#999",
    fontSize: 12,
    marginHorizontal: 4,
  },
  devButton: {
    marginTop: 24,
    borderWidth: 1,
    borderColor: "#999",
    borderStyle: "dashed",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: "center",
  },
  devButtonText: {
    fontSize: 14,
    color: "#666",
    fontWeight: "600",
  },
});
