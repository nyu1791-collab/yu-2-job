/**
 * RevenueCat SDK (`react-native-purchases`) ラッパー(PLAN.md §4.4/§4.5 M5)。
 *
 * 環境変数:
 *   EXPO_PUBLIC_RC_API_KEY - RevenueCatのプラットフォーム別Public SDK Key。
 *
 * 未設定の場合、`isPurchasesConfigured()` が false を返し、
 * paywall.tsx は「devスキップ」ボタンのみを表示するフォールバックUIになる
 * (実機・ストア接続なしでも開発を止めないための設計、PLAN.md §4.5 M5)。
 *
 * 商品構成(RevenueCat Dashboardで設定する想定):
 *   - entitlement: "premium"
 *   - offering "default" に month/year の2パッケージ
 *     - month: pashacaro_monthly (月額980円・7日間無料トライアル)
 *     - year:  pashacaro_yearly  (年額6,800円・7日間無料トライアル)
 */

import { Platform } from "react-native";
import Purchases, {
  type CustomerInfo,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases";

/** premium entitlementの識別子(RevenueCat Dashboard側の設定と一致させる)。 */
export const PREMIUM_ENTITLEMENT_ID = "premium";

let configured = false;

/** EXPO_PUBLIC_RC_API_KEY が設定されているか(Offeringsを取得できるか)。 */
export function isPurchasesConfigured(): boolean {
  return Boolean(process.env["EXPO_PUBLIC_RC_API_KEY"]);
}

/**
 * RevenueCat SDKを初期化する(初回のみ)。
 * EXPO_PUBLIC_RC_API_KEY が未設定の場合は何もしない。
 *
 * iOS/AndroidでAPIキーを切り替えたい場合は
 * EXPO_PUBLIC_RC_API_KEY_IOS / EXPO_PUBLIC_RC_API_KEY_ANDROID を優先する。
 */
export function configurePurchases(): void {
  if (configured) {
    return;
  }
  const platformKey =
    Platform.OS === "ios"
      ? process.env["EXPO_PUBLIC_RC_API_KEY_IOS"]
      : process.env["EXPO_PUBLIC_RC_API_KEY_ANDROID"];
  const apiKey = platformKey ?? process.env["EXPO_PUBLIC_RC_API_KEY"];
  if (!apiKey) {
    return;
  }
  Purchases.configure({ apiKey });
  configured = true;
}

/** デフォルトofferingのパッケージ一覧を取得する。取得失敗時はnull。 */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  if (!isPurchasesConfigured()) {
    return null;
  }
  configurePurchases();
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current ?? null;
  } catch (err) {
    console.error("RevenueCat getOfferings failed:", err);
    return null;
  }
}

export interface PurchaseResult {
  ok: boolean;
  entitled: boolean;
  customerInfo?: CustomerInfo;
  cancelled?: boolean;
  message?: string;
}

/** 指定パッケージを購入する。 */
export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseResult> {
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return {
      ok: true,
      entitled: isEntitled(customerInfo),
      customerInfo,
    };
  } catch (err) {
    const purchaseError = err as { userCancelled?: boolean; message?: string };
    if (purchaseError.userCancelled) {
      return { ok: false, entitled: false, cancelled: true };
    }
    console.error("RevenueCat purchasePackage failed:", err);
    return { ok: false, entitled: false, message: purchaseError.message ?? "購入に失敗しました。" };
  }
}

/** 購入を復元する(「購入を復元」ボタン用)。 */
export async function restorePurchases(): Promise<PurchaseResult> {
  try {
    const customerInfo = await Purchases.restorePurchases();
    return { ok: true, entitled: isEntitled(customerInfo), customerInfo };
  } catch (err) {
    console.error("RevenueCat restorePurchases failed:", err);
    return { ok: false, entitled: false, message: "復元に失敗しました。" };
  }
}

/** CustomerInfoから premium entitlementが有効か判定する。 */
export function isEntitled(customerInfo: CustomerInfo): boolean {
  return Boolean(customerInfo.entitlements.active[PREMIUM_ENTITLEMENT_ID]);
}

/**
 * サインイン成功後、RevenueCatの匿名ユーザーをサーバのuserIdへエイリアス統合する。
 * 戻り値はRevenueCat側のapp_user_id(= userId、Purchases.logIn成功時)。
 */
export async function logInRevenueCat(userId: string): Promise<string | null> {
  if (!isPurchasesConfigured()) {
    return null;
  }
  configurePurchases();
  try {
    const { customerInfo } = await Purchases.logIn(userId);
    return customerInfo.originalAppUserId;
  } catch (err) {
    console.error("RevenueCat logIn failed:", err);
    return null;
  }
}
