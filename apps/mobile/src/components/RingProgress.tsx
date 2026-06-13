import { StyleSheet, Text, View } from "react-native";

/**
 * 円形プログレスリング(Viewベース)。
 *
 * 外部チャートライブラリ(react-native-svg等)を使わず、回転させた半円2枚を
 * 重ねるCSS的手法で円形プログレスを表現する。
 *
 * - progress: 0〜1(1を超える場合は1にclamp。0未満は0にclamp)
 * - 0.5を境に「右半分のみ回転」「右半分固定+左半分回転」の2フェーズで描画する
 */

export interface RingProgressProps {
  /** 0〜1の進捗(残量表示の場合は呼び出し側で 1 - 残量/目標 等に変換して渡す) */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  trackColor?: string;
  children?: React.ReactNode;
}

export function RingProgress({
  progress,
  size = 160,
  strokeWidth = 14,
  color = "#0a7ea4",
  trackColor = "#e6f0f3",
  children,
}: RingProgressProps): React.ReactElement {
  const clamped = Math.min(1, Math.max(0, progress));
  const radius = size / 2;

  // 0〜0.5 は右半分のみ、0.5〜1 は右半分全体 + 左半分の一部を回転で表現
  const rightRotation = Math.min(clamped, 0.5) * 360; // 0deg〜180deg
  const leftRotation = Math.max(0, clamped - 0.5) * 360; // 0deg〜180deg

  return (
    <View style={[styles.container, { width: size, height: size }]}>
      {/* トラック(背景の輪) */}
      <View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: radius,
            borderWidth: strokeWidth,
            borderColor: trackColor,
          },
        ]}
      />

      {/* 右半分(0〜180deg) */}
      <View style={[styles.half, { width: radius, height: size, right: 0, overflow: "hidden" }]}>
        <View
          style={[
            styles.circle,
            {
              width: size,
              height: size,
              borderRadius: radius,
              borderWidth: strokeWidth,
              borderColor: color,
              transform: [{ rotate: `${rightRotation}deg` }],
            },
          ]}
        />
      </View>

      {/* 左半分(180〜360deg)。clamped > 0.5 のときのみ着色を回転表示 */}
      {clamped > 0.5 ? (
        <View style={[styles.half, { width: radius, height: size, left: 0, overflow: "hidden" }]}>
          <View
            style={[
              styles.circle,
              styles.circleAbsoluteLeft,
              {
                width: size,
                height: size,
                borderRadius: radius,
                borderWidth: strokeWidth,
                borderColor: color,
                transform: [{ rotate: `${leftRotation}deg` }],
              },
            ]}
          />
        </View>
      ) : null}

      {/* 中央のコンテンツ */}
      <View style={styles.centerContent}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  circle: {
    position: "absolute",
    borderColor: "transparent",
  },
  half: {
    position: "absolute",
    top: 0,
  },
  circleAbsoluteLeft: {
    left: 0,
  },
  centerContent: {
    alignItems: "center",
    justifyContent: "center",
  },
});

/** リング中央に表示する「kcal残量」テキスト。 */
export function RingCenterLabel({
  value,
  unit,
  label,
}: {
  value: number;
  unit: string;
  label: string;
}): React.ReactElement {
  return (
    <View style={styles.centerContent}>
      <Text style={ringLabelStyles.value}>{Math.round(value)}</Text>
      <Text style={ringLabelStyles.unit}>{unit}</Text>
      <Text style={ringLabelStyles.label}>{label}</Text>
    </View>
  );
}

const ringLabelStyles = StyleSheet.create({
  value: {
    fontSize: 32,
    fontWeight: "800",
    color: "#222",
  },
  unit: {
    fontSize: 13,
    color: "#666",
    marginTop: -2,
  },
  label: {
    fontSize: 12,
    color: "#999",
    marginTop: 4,
  },
});
