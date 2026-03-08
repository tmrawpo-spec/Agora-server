import React, { useState, useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth, Gender } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { Colors } from "@/constants/colors";
import { t, Language } from "@/constants/i18n";
import { generateMatchedProfile } from "@/constants/fakeProfiles";

type MatchState = "idle" | "searching" | "matched";

export default function MatchScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { addConversation } = useData();

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // ✅ 실시간 언어 반영을 위해 user?.language를 lang으로 확정
  const lang = (user?.language || "en") as Language;

  const [matchState, setMatchState] = useState<MatchState>("idle");
  const [matchedProfile, setMatchedProfile] = useState<any>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.4);
  const btnScale = useSharedValue(1);
  const btnRotate = useSharedValue(0);

  useEffect(() => {
    if (matchState === "searching") {
      pulseScale.value = withRepeat(
        withTiming(2.4, { duration: 1100 }),
        -1,
        true,
      );
      pulseOpacity.value = withRepeat(
        withTiming(0, { duration: 1100 }),
        -1,
        true,
      );
      btnRotate.value = withRepeat(
        withTiming(360, { duration: 3000 }),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      cancelAnimation(btnRotate);
      pulseScale.value = withTiming(1);
      pulseOpacity.value = withTiming(0.4);
      btnRotate.value = withTiming(0);
    }
  }, [matchState]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const btnAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: btnScale.value }],
  }));

  async function handleStartMatching() {
    if (matchState === "searching") {
      setMatchState("idle");
      if (searchTimer.current) clearTimeout(searchTimer.current);
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    btnScale.value = withSpring(0.9, {}, () => {
      btnScale.value = withSpring(1);
    });

    setMatchState("searching");

    const delay = 2000 + Math.random() * 3000;
    searchTimer.current = setTimeout(async () => {
      const oppositeGender: Gender =
        user?.gender === "male" ? "female" : "male";
      const profile = generateMatchedProfile(oppositeGender, lang);
      setMatchedProfile(profile);
      setMatchState("matched");
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, delay);
  }

  async function acceptMatch() {
    if (!matchedProfile) return;

    const tempConvoId = `call_${Date.now()}`;
    const pName = matchedProfile.nickname;
    // 가짜 프로필 데이터에서 토큰을 가져오거나 없으면 임시값 설정
    const tToken = matchedProfile.fcmToken || "dummy_token"; 

    console.log("📍 [MatchScreen] 통화 시작! 목적지: CallingScreen");
    console.log("📍 전송 데이터:", { tempConvoId, pName, tToken });

    setMatchState("idle");
    setMatchedProfile(null);

    // ✅ params에 targetToken을 반드시 추가해야 합니다.
    router.push({
      pathname: "/matching/calling",
      params: { 
        convoId: tempConvoId, 
        profileName: pName,
        targetToken: tToken // 👈 추가됨
      },
    });
  }

  function declineMatch() {
    setMatchState("idle");
    setMatchedProfile(null);
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t(lang, "match")}</Text>
      </View>

      <View style={styles.centerSection}>
        {matchState === "idle" && (
          <View style={styles.idleContainer}>
            <Animated.View style={[styles.pulseRing, pulseStyle]} />
            <Animated.View style={btnAnimStyle}>
              <Pressable onPress={handleStartMatching}>
                <LinearGradient
                  colors={[Colors.accent, "#c01f5d", "#8b0a3d"]}
                  style={styles.matchBtn}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="moon" size={40} color="#fff" />
                  <Text style={styles.matchBtnText}>
                    {t(lang, "start_matching")}
                  </Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
            <Text style={styles.matchHint}>
              {t(lang, "match_hint")}
            </Text>
          </View>
        )}

        {matchState === "searching" && (
          <View style={styles.searchingContainer}>
            <Animated.View style={[styles.searchPulse, pulseStyle]} />
            <Animated.View style={[styles.searchPulse2, pulseStyle]} />
            <View style={styles.searchOrb}>
              <LinearGradient
                colors={[Colors.accent, "#c01f5d"]}
                style={styles.searchOrbGrad}
              >
                <Ionicons name="moon" size={44} color="#fff" />
              </LinearGradient>
            </View>
            <Text style={styles.searchingText}>{t(lang, "searching")}</Text>
            <Pressable style={styles.cancelBtn} onPress={handleStartMatching}>
              <Text style={styles.cancelText}>{t(lang, "cancel")}</Text>
            </Pressable>
          </View>
        )}

        {matchState === "matched" && matchedProfile && (
          <View style={styles.matchedContainer}>
            <LinearGradient
              colors={["rgba(232,70,124,0.18)", "transparent"]}
              style={styles.matchedGradBg}
            />
            <View style={styles.matchedGlow} />
            <Text style={styles.matchedTitle}>
              {t(lang, "match_success")}
            </Text>
            <View style={styles.matchedAvatar}>
              <LinearGradient
                colors={
                  matchedProfile.gender === "female"
                    ? [Colors.accent, "#c01f5d"]
                    : [Colors.blue, "#2255aa"]
                }
                style={styles.matchedAvatarGrad}
              >
                <Ionicons
                  name={matchedProfile.gender === "female" ? "female" : "male"}
                  size={44}
                  color="#fff"
                />
              </LinearGradient>
            </View>
            <Text style={styles.matchedName}>{matchedProfile.nickname}</Text>
            <Text style={styles.matchedSub}>
              {matchedProfile.age}{t(lang, "years_old")} · {matchedProfile.distanceKm} km {lang === "ko" ? "거리에 있음" : "away"}
            </Text>

            <View style={styles.matchedActions}>
              <Pressable style={styles.declineBtn} onPress={declineMatch}>
                <Ionicons name="close" size={30} color={Colors.danger} />
              </Pressable>
              <Pressable style={styles.acceptBtnWrap} onPress={acceptMatch}>
                <LinearGradient
                  colors={[Colors.accent, "#c01f5d"]}
                  style={styles.acceptBtnGrad}
                >
                  <Ionicons name="call" size={28} color="#fff" />
                  <Text style={styles.acceptText}>
                    {t(lang, "start_call")}
                  </Text>
                </LinearGradient>
              </Pressable>
            </View>
          </View>
        )}
      </View>

      <View style={styles.infoSection}>
        <View style={styles.infoCard}>
          <Ionicons name="time-outline" size={20} color={Colors.accent} />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>
              {t(lang, "info_free_call_title")}
            </Text>
            <Text style={styles.infoDesc}>
              {t(lang, "info_free_call_desc")}
            </Text>
          </View>
        </View>
        <View style={styles.infoCard}>
          <Ionicons name="heart-outline" size={20} color={Colors.accent} />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>
              {t(lang, "info_heart_title")}
            </Text>
            <Text style={styles.infoDesc}>
              {t(lang, "info_heart_desc")}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

// ... styles는 이전과 동일 (생략 없음)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    paddingTop: 8,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.textPrimary,
  },
  centerSection: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  idleContainer: { alignItems: "center", gap: 24 },
  pulseRing: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  matchBtn: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  matchBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 13,
    textAlign: "center",
  },
  matchHint: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 240,
  },
  searchingContainer: { alignItems: "center", gap: 24 },
  searchPulse: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    borderWidth: 2.5,
    borderColor: Colors.accent,
  },
  searchPulse2: {
    position: "absolute",
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1.5,
    borderColor: "rgba(232,70,124,0.4)",
  },
  searchOrb: { width: 120, height: 120, borderRadius: 60, overflow: "hidden" },
  searchOrbGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  searchingText: {
    color: Colors.textSecondary,
    fontWeight: "600",
    fontSize: 16,
  },
  cancelBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cancelText: {
    color: Colors.textSecondary,
    fontWeight: "600",
    fontSize: 14,
  },
  matchedContainer: {
    alignItems: "center",
    gap: 12,
    width: "100%",
    paddingHorizontal: 24,
  },
  matchedGlow: {
    position: "absolute",
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: "rgba(232,70,124,0.12)",
  },
  matchedGradBg: {
    position: "absolute",
    top: -120,
    left: 0,
    right: 0,
    height: 350,
  },
  matchedTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.accent,
  },
  matchedAvatar: {
    width: 110,
    height: 110,
    borderRadius: 55,
    overflow: "hidden",
  },
  matchedAvatarGrad: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  matchedName: {
    fontSize: 24,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  matchedSub: {
    fontSize: 14,
    color: Colors.textSecondary,
  },
  matchedActions: { flexDirection: "row", gap: 20, marginTop: 12 },
  declineBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,70,70,0.12)",
    borderWidth: 2,
    borderColor: Colors.danger,
  },
  acceptBtnWrap: { borderRadius: 34, overflow: "hidden" },
  acceptBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 28,
    paddingVertical: 20,
    borderRadius: 34,
  },
  acceptText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  infoSection: {
    padding: 20,
    paddingBottom: 120,
    gap: 10,
  },
  infoCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoText: { flex: 1, gap: 4 },
  infoTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  infoDesc: {
    fontSize: 12,
    color: Colors.textSecondary,
    lineHeight: 18,
  },
});