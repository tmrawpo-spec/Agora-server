import React, { useEffect } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";

export default function IndexScreen() {
  const { isAuthenticated, isProfileComplete, isLoading } = useAuth();

  useEffect(() => {
    // 인증 로딩이 끝나면 화면 이동을 결정합니다.
    if (!isLoading) {
      if (!isAuthenticated) {
        // 1. 로그인 안 되어 있으면 환영 페이지로
        router.replace("/(auth)/welcome");
      } else if (!isProfileComplete) {
        // 2. 로그인은 됐는데 프로필이 없으면 설정 페이지로
        router.replace("/(auth)/profile-setup");
      } else {
        // 3. 모두 완료되었다면 메인 탭으로
        router.replace("/(tabs)");
      }
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