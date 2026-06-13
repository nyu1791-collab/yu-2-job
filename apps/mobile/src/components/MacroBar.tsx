import { StyleSheet, Text, View } from "react-native";

/**
 * P/F/C残量バー(Viewベースの横棒グラフ)。
 *
 * consumed/target からプログレス(0〜1、1超はclamp)を計算して表示する。
 * 残量が負(目標超過)の場合は0gとして表示し、バーは満タン(かつ警告色)にする。
 */
export interface MacroBarProps {
  label: string;
  consumed: number;
  target: number;
  color: string;
}

export function MacroBar({ label, consumed, target, color }: MacroBarProps): React.ReactElement {
  const remaining = target - consumed;
  const progress = target > 0 ? Math.min(1, Math.max(0, consumed / target)) : 0;
  const isOver = remaining < 0;

  return (
    <View style={styles.row}>
      <View style={styles.labelColumn}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.remaining, isOver && styles.remainingOver]}>
          残り {Math.round(Math.max(0, remaining))}g
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View
          style={[
            styles.barFill,
            {
              width: `${progress * 100}%`,
              backgroundColor: isOver ? "#e74c3c" : color,
            },
          ]}
        />
      </View>
      <Text style={styles.targetText}>
        {Math.round(consumed)} / {Math.round(target)}g
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  labelColumn: {
    width: 64,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
  },
  remaining: {
    fontSize: 11,
    color: "#888",
  },
  remainingOver: {
    color: "#e74c3c",
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#eee",
    overflow: "hidden",
  },
  barFill: {
    height: "100%",
    borderRadius: 5,
  },
  targetText: {
    fontSize: 12,
    color: "#666",
    minWidth: 76,
    textAlign: "right",
  },
});
