import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";

export default function IndexScreen() {
  const { isAuthenticated, isProfileComplete, isLoading } = useAuth();

  useEffect(() => {
  if (isLoading) return; // 로딩 중엔 아무것도 안 함

  if (!isAuthenticated) {
    router.replace("/(auth)/welcome");
  } else if (!isProfileComplete) {
    router.replace("/(auth)/profile-setup");
  } else {
    router.replace("/(tabs)");
  }
}, [isLoading, isAuthenticated, isProfileComplete]);

  return (
    <View style={styles.container}>
      {/* 앱 진입 시 보여줄 로딩 스피너 */}
      <ActivityIndicator size="large" color={Colors.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
});