import * as ImageManipulator from "expo-image-manipulator";

/**
 * PLAN.md §4.1: クライアントで長辺1024px / JPEG品質0.7に縮小してbase64でPOSTする。
 *
 * 1枚あたり概ね1,100〜1,600トークンに収まるサイズを目安とする。
 */
export const MAX_LONG_EDGE_PX = 1024;
export const JPEG_QUALITY = 0.7;

export interface ResizedImage {
  uri: string;
  base64: string;
  width: number;
  height: number;
}

/**
 * 画像を長辺1024px・JPEG品質0.7にリサイズし、base64を返す。
 *
 * @param uri 元画像のURI(カメラ撮影結果 or ライブラリ選択結果)
 * @param originalWidth 元画像の幅
 * @param originalHeight 元画像の高さ
 */
export async function resizeForUpload(
  uri: string,
  originalWidth: number,
  originalHeight: number,
): Promise<ResizedImage> {
  const longEdge = Math.max(originalWidth, originalHeight);
  const scale = longEdge > MAX_LONG_EDGE_PX ? MAX_LONG_EDGE_PX / longEdge : 1;

  const targetWidth = Math.round(originalWidth * scale);
  const targetHeight = Math.round(originalHeight * scale);

  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: targetWidth, height: targetHeight } }],
    {
      compress: JPEG_QUALITY,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );

  if (!result.base64) {
    throw new Error("画像のbase64エンコードに失敗しました。");
  }

  return {
    uri: result.uri,
    base64: result.base64,
    width: result.width,
    height: result.height,
  };
}
