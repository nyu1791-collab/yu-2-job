import { Redirect } from "expo-router";

/**
 * (tabs)/capture-fab.tsx
 *
 * 中央の撮影FAB用のダミールート。
 * _layout.tsx の tabBarButton で onPress を上書きし、capture/camera へ直接pushするため
 * この画面が実際に表示されることは無いが、Expo Routerのタブ登録上ファイルが必要。
 * 万一表示された場合はホームへリダイレクトする。
 */
export default function CaptureFabPlaceholder() {
  return <Redirect href="/(tabs)" />;
}
