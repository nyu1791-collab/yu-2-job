/**
 * Web向けの purchases.ts シム(Metroが `Platform.OS === "web"` バンドルで自動選択する)。
 *
 * Webデモは見た目確認のみが目的で、課金フロー(RevenueCat)はApp/Play側でテストする想定。
 * `react-native-purchases` をWebエントリにバンドルしないことで、ネイティブモジュール前提の
 * コードがブラウザで評価される余地を完全に排除する(import時の白画面クラッシュ防止)。
 *
 * 公開APIはネイティブ版(purchases.ts)と同一シグネチャを維持し、すべて安全なno-op/nullを返す。
 * 型(PurchasesOffering/PurchasesPackage/CustomerInfo)はコンパイル時に消去されるため、
 * `react-native-purchases` から型だけを参照してもWebバンドルには含まれない。
 */

import type {
  CustomerInfo,
  PurchasesOffering,
  PurchasesPackage,
} from "react-native-purchases";

/** premium entitlementの識別子(ネイティブ版と一致させる)。 */
export const PREMIUM_ENTITLEMENT_ID = "premium";

/** Web版では購入機能を提供しないため常にfalse。 */
export function isPurchasesConfigured(): boolean {
  return false;
}

/** Web版ではno-op。 */
export function configurePurchases(): void {
  // no-op on web
}

/** Web版では常にnull。 */
export async function getCurrentOffering(): Promise<PurchasesOffering | null> {
  return null;
}

export interface PurchaseResult {
  ok: boolean;
  entitled: boolean;
  customerInfo?: CustomerInfo;
  cancelled?: boolean;
  message?: string;
}

/** Web版では購入できない。 */
export async function purchasePackage(_pkg: PurchasesPackage): Promise<PurchaseResult> {
  return { ok: false, entitled: false, message: "Webデモでは購入機能は利用できません。" };
}

/** Web版では復元できない。 */
export async function restorePurchases(): Promise<PurchaseResult> {
  return { ok: false, entitled: false, message: "Webデモでは購入機能は利用できません。" };
}

/** Web版では常にfalse。 */
export function isEntitled(_customerInfo: CustomerInfo): boolean {
  return false;
}

/** Web版では常にnull(RevenueCat未接続)。 */
export async function logInRevenueCat(_userId: string): Promise<string | null> {
  return null;
}
