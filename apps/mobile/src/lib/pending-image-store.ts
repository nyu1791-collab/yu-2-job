/**
 * capture/camera.tsx で撮影・選択した画像(リサイズ済みbase64)を、
 * capture/analyzing.tsx に画面遷移後も受け渡すための一時的なモジュールスコープストア。
 *
 * Expo Routerの画面遷移ではパラメータに大きなbase64文字列を載せるのは
 * 不適切なため、シンプルなモジュール変数で保持する(M1向けの最小実装)。
 */

export interface PendingImage {
  base64: string;
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
}

let pendingImage: PendingImage | null = null;

/** camera.tsx から呼び出し、画像をセットする */
export function setPendingImage(image: PendingImage): void {
  pendingImage = image;
}

/** analyzing.tsx から呼び出し、保持している画像を取得する(取得後はクリアしない) */
export function getPendingImage(): PendingImage | null {
  return pendingImage;
}

/** 解析完了後やキャンセル時にクリアする */
export function clearPendingImage(): void {
  pendingImage = null;
}
