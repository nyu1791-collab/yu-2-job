import { router, Tabs } from "expo-router";
import { Pressable, StyleSheet, Text, View, type ColorValue } from "react-native";

/**
 * (tabs)/_layout.tsx
 *
 * タブレイアウト: ホーム / 履歴 / 設定 + 中央の撮影FAB。
 *
 * 撮影タブは画面遷移を持たず、タップ時に capture/camera へpushするだけの
 * 「ボタン」として機能する(tabPressをpreventDefaultしてタブ切り替えを抑止)。
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#0a7ea4",
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "ホーム",
          tabBarLabel: "ホーム",
          tabBarIcon: ({ color }) => <TabIcon emoji="🏠" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "履歴",
          tabBarLabel: "履歴",
          tabBarIcon: ({ color }) => <TabIcon emoji="📅" color={color} />,
        }}
      />
      <Tabs.Screen
        name="capture-fab"
        options={{
          title: "",
          tabBarLabel: () => null,
          tabBarIcon: () => <CaptureFab />,
          tabBarButton: ({ ref: _ref, ...props }) => (
            <Pressable
              {...props}
              onPress={() => router.push("/capture/camera")}
              style={styles.fabButton}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "設定",
          tabBarLabel: "設定",
          tabBarIcon: ({ color }) => <TabIcon emoji="⚙️" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({ emoji, color }: { emoji: string; color: ColorValue }) {
  return <Text style={[styles.tabIcon, { color }]}>{emoji}</Text>;
}

function CaptureFab() {
  return (
    <View style={styles.fab}>
      <Text style={styles.fabText}>📷</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabIcon: {
    fontSize: 20,
  },
  fabButton: {
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#0a7ea4",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  fabText: {
    fontSize: 24,
  },
});
