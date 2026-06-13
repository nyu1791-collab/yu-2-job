import { Redirect } from "expo-router";

/**
 * (tabs)/capture-fab.tsx
 *
 * 中央の撮影FAB用のダミールート。
 * _layout.tsx の tabBarButton で onPress を上書きし、capture/camera へ直接pushするため
 * この画面が実際に表示されることは(ネイティブでは)無いが、Expo Routerのタブ登録上ファイルが必要。
 *
 * Web版では、FABの押下時に(onPressのpush処理に加えて)このタブ自体への遷移も発生し、
 * この画面が一瞬表示されてしまう。以前は `/(tabs)`(ホーム)へリダイレクトしていたため
 * 「カメラ画面が一瞬で消えてホームに戻る」不具合になっていた。
 * camera画面へリダイレクトすることで、どちらの遷移が後勝ちしても撮影画面に着地する。
 */
export default function CaptureFabPlaceholder() {
  return <Redirect href="/capture/camera" />;
}
