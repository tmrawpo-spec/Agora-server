import React from "react";
import { Stack } from "expo-router";
import { Colors } from "@/constants/colors";

/**
 * 인증 관련 화면들(웰컴, 로그인, 회원가입 등)을 관리하는 레이아웃입니다.
 * 통화 수신 로직은 최상위 _layout.tsx에 있으므로 여기서는 네비게이션만 설정합니다.
 */
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.background },
        animation: "fade", // 화면 전환 시 부드럽게 페이드 효과
      }}
    >
      {/* 인증 그룹 내의 세부 화면들 */}
      <Stack.Screen name="welcome" />
      <Stack.Screen name="verify-email" />
      <Stack.Screen name="profile-setup" />
    </Stack>
  );
}