import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

/**
 * `expo-secure-store` のWeb対応ラッパー。
 *
 * このSDKバージョンの `expo-secure-store` はWeb向けのモジュール自体は存在するが、
 * 実体は `export default {}`(スタブ)であり、`getItemAsync`/`setItemAsync`/
 * `deleteItemAsync` を呼ぶと `undefined is not a function` で例外になる。
 *
 * Web版(`Platform.OS === "web"`)では `localStorage` にフォールバックし、
 * iOS/Androidでは従来通り `expo-secure-store` を使う(動作は変更しない)。
 *
 * WebデモはブラウザのlocalStorageに認証トークン等を平文保存することになるが、
 * これは「UI/見た目を確認するデモ」用途のみのフォールバックであり、
 * ネイティブ版のセキュリティ特性には影響しない。
 */

function isWeb(): boolean {
  return Platform.OS === "web";
}

export async function getItemAsync(key: string): Promise<string | null> {
  if (isWeb()) {
    if (typeof localStorage === "undefined") {
      return null;
    }
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  if (isWeb()) {
    if (typeof localStorage === "undefined") {
      return;
    }
    localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  if (isWeb()) {
    if (typeof localStorage === "undefined") {
      return;
    }
    localStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}
