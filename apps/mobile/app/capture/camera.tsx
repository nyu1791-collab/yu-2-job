import { CameraView, useCameraPermissions, type CameraCapturedPicture } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { resizeForUpload } from "../../src/lib/image-processing";
import { setPendingImage } from "../../src/lib/pending-image-store";
import { showAlert } from "../../src/lib/alert";

/**
 * capture/camera.tsx
 *
 * expo-camera による撮影 + expo-image-picker によるライブラリ選択。
 * 撮影/選択後、expo-image-manipulator で長辺1024px・品質0.7に縮小し、
 * pending-image-store に保存して analyzing.tsx に遷移する。
 */
export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  // Web(ブラウザ): ライブカメラ(CameraView)はiOS Safariで権限プロンプトが
  // すぐ消える等で不安定なため使わず、OSの写真ダイアログ(撮影/ライブラリ選択)に
  // 統一する。expo-image-picker はWebでファイル選択(iOSではその場で撮影も選べる)を開く。
  if (Platform.OS === "web") {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>食事の写真を撮るか、ライブラリから選んでください。</Text>
        <Pressable style={styles.primaryButton} onPress={handlePickFromLibrary}>
          <Text style={styles.primaryButtonText}>写真を撮る / 選ぶ</Text>
        </Pressable>
        <Pressable
          style={styles.secondaryButton}
          onPress={() => router.push("/capture/text-input")}
        >
          <Text style={styles.secondaryButtonText}>✎ テキストで入力</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>戻る</Text>
        </Pressable>
      </View>
    );
  }

  if (!permission) {
    return <View style={styles.container} />;
  }

  if (!permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>カメラへのアクセスを許可してください。</Text>
        <Pressable style={styles.primaryButton} onPress={requestPermission}>
          <Text style={styles.primaryButtonText}>許可する</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>戻る</Text>
        </Pressable>
      </View>
    );
  }

  async function handleCaptured(picture: CameraCapturedPicture) {
    if (!picture.width || !picture.height) {
      showAlert("エラー", "画像サイズの取得に失敗しました。");
      return;
    }
    const resized = await resizeForUpload(picture.uri, picture.width, picture.height);
    setPendingImage({ base64: resized.base64, mediaType: "image/jpeg" });
    router.replace("/capture/analyzing");
  }

  async function handleTakePhoto() {
    if (!cameraRef.current || isCapturing) return;
    setIsCapturing(true);
    try {
      const picture = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      if (picture) {
        await handleCaptured(picture);
      }
    } catch (err) {
      console.error(err);
      showAlert("エラー", "撮影に失敗しました。もう一度お試しください。");
    } finally {
      setIsCapturing(false);
    }
  }

  async function handlePickFromLibrary() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
    });
    if (result.canceled || result.assets.length === 0) return;

    const asset = result.assets[0]!;
    const resized = await resizeForUpload(asset.uri, asset.width, asset.height);
    setPendingImage({ base64: resized.base64, mediaType: "image/jpeg" });
    router.replace("/capture/analyzing");
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />
      <View style={styles.controls}>
        <Pressable style={styles.secondaryButton} onPress={handlePickFromLibrary}>
          <Text style={styles.secondaryButtonText}>ライブラリから選択</Text>
        </Pressable>
        <Pressable
          style={[styles.shutterButton, isCapturing && styles.shutterButtonDisabled]}
          onPress={handleTakePhoto}
          disabled={isCapturing}
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={() => router.back()}>
          <Text style={styles.secondaryButtonText}>キャンセル</Text>
        </Pressable>
      </View>
      <Pressable style={styles.textInputLink} onPress={() => router.push("/capture/text-input")}>
        <Text style={styles.textInputLinkText}>✎ テキストで入力</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
    gap: 16,
    padding: 24,
  },
  message: {
    color: "#fff",
    textAlign: "center",
    fontSize: 16,
  },
  camera: {
    flex: 1,
    width: "100%",
  },
  controls: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#ccc",
  },
  shutterButtonDisabled: {
    opacity: 0.5,
  },
  shutterInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#fff",
  },
  primaryButton: {
    backgroundColor: "#0a7ea4",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  primaryButtonText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: "#fff",
    fontSize: 14,
  },
  textInputLink: {
    position: "absolute",
    top: 16,
    right: 16,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  textInputLinkText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
