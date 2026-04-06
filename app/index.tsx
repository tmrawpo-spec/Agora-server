import React, { useEffect, useRef } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { auth } from "@/constants/firebase";

export default function IndexScreen() {
  const { user, isLoading } = useAuth();
  const hasNavigated = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const routeUser = async () => {
      if (isLoading || hasNavigated.current) return;

      const fbUser = auth.currentUser;

      if (fbUser) {
        try {
          await fbUser.reload();
        } catch (e) {
          console.log("⚠️ index auth reload 실패:", e);
        }
      }

      if (cancelled || hasNavigated.current) return;

      const currentUser = auth.currentUser;
      const isPasswordUser =
        currentUser?.providerData?.some((p) => p.providerId === "password") ?? false;

      if (currentUser && isPasswordUser && !currentUser.emailVerified) {
        hasNavigated.current = true;
        console.log("⛔ index: 이메일 미인증 유저 → verify-email");
        router.replace("/(auth)/verify-email");
        return;
      }

      const hasNickname = !!user?.nickname?.trim();

      console.log("🚀 최종 라우팅:", {
        authUid: currentUser?.uid,
        profileUid: user?.id,
        nickname: user?.nickname,
        hasNickname,
        emailVerified: currentUser?.emailVerified,
      });

      hasNavigated.current = true;

      if (!user) {
        router.replace("/(auth)/welcome");
      } else if (!hasNickname) {
        router.replace("/(auth)/profile-setup");
      } else {
        router.replace("/(tabs)");
      }
    };

    routeUser();

    return () => {
      cancelled = true;
    };
  }, [isLoading, user]);

  return (
    <View style={styles.container}>
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
