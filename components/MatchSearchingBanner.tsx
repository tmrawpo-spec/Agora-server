import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMatch } from "@/contexts/MatchContext";
import { Colors } from "@/constants/colors";

export default function MatchSearchingBanner() {
  const insets = useSafeAreaInsets();
  const { isSearching, cancelMatchingGlobally } = useMatch();

  if (!isSearching) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { bottom: Math.max(insets.bottom + 72, 88) }]}
    >
      <View style={styles.banner}>
        <Pressable
          style={styles.mainArea}
          onPress={() => router.push("/(tabs)/match")}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="search" size={16} color={Colors.accent} />
          </View>
          <View style={styles.textWrap}>
            <Text style={styles.title}>매칭 상대를 찾는 중</Text>
            <Text style={styles.sub}>다른 탭을 보고 있어도 계속 탐색 중이에요</Text>
          </View>
        </Pressable>

        <Pressable
          style={styles.stopBtn}
          onPress={cancelMatchingGlobally}
          hitSlop={8}
        >
          <Text style={styles.stopText}>중지</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 999,
    elevation: 999,
  },
  banner: {
    width: "90%",
    minHeight: 58,
    borderRadius: 18,
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1,
    borderColor: Colors.border,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 12,
    paddingRight: 10,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  mainArea: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,70,124,0.12)",
    marginRight: 10,
  },
  textWrap: {
    flex: 1,
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 14,
    fontWeight: "800",
  },
  sub: {
    color: Colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  stopBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  stopText: {
    color: Colors.accent,
    fontSize: 13,
    fontWeight: "800",
  },
});
