import React, { useEffect, useMemo, useState, useRef } from "react";
import { 
  View, 
  Text, 
  StyleSheet, 
  Pressable, 
  ActivityIndicator,
  Alert 
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { Colors } from "@/constants/colors";
import { t, Language } from "@/constants/i18n";

const DECISION_TIMEOUT = 30; // 30초 제한시간

export default function DecisionScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { addConversation } = useData();
  const isMounted = useRef(true);

  // ✅ 상태 관리
  const [hasChosen, setHasChosen] = useState(false); 
  const [timeLeft, setTimeLeft] = useState(DECISION_TIMEOUT);

  const timerRef = useRef<any>(null);

  const lang = useMemo(() => (user?.language || "ko") as Language, [user?.language]);

  const { convoId, profileName, isLookTab } = useLocalSearchParams<{
    convoId: string;
    profileName: string;
    isLookTab?: string;
  }>();

  const topPad = insets.top > 0 ? insets.top : 60;
  const botPad = insets.bottom > 0 ? insets.bottom : 40;

  const modalScale = useSharedValue(0.9);
  const modalOpacity = useSharedValue(0);

  useEffect(() => {
    isMounted.current = true;

    // ✅ [중요] 둘러보기 탭에서 온 경우, 이 화면에 머무를 필요가 없으므로 즉시 처리 후 이동
    if (isLookTab === "true") {
      handleLookTabAutoProcess();
      return; 
    }

    // 일반 매칭의 경우 애니메이션 및 타이머 시작
    modalScale.value = withSpring(1, { damping: 15, stiffness: 100 });
    modalOpacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) });

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

    startTimer();

    const socket = (global as any).chatSocket || (window as any).chatSocket;
    const handleMessage = (event: any) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "match_result" && isMounted.current) {
          handleMatchResult(data.result);
        }
      } catch (e) {
        console.warn("Socket Message Error:", e);
      }
    };

    if (socket) {
      socket.addEventListener("message", handleMessage);
    }

    return () => {
      isMounted.current = false;
      stopTimer();
      if (socket) {
        socket.removeEventListener("message", handleMessage);
      }
    };
  }, []);

  // ✅ 둘러보기 모드 전용 즉시 처리 로직
  const handleLookTabAutoProcess = async () => {
    // 1. 친구 추가 실행
    await addConversation({
      id: convoId || String(Date.now()),
      nickname: profileName || "User",
      gender: "female", 
      age: 20, 
      language: lang, 
      location: "Unknown", 
      distanceKm: 0, 
      isOnline: true,
    });

    // 2. 서버에도 선택 완료 알림 (선택사항이지만 데이터 일관성을 위해 전송)
    const socket = (global as any).chatSocket || (window as any).chatSocket;
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({ type: "finish_choice", choice: "heart", matchId: convoId }));
    }

    // 3. 즉시 채팅방으로 이동
    router.replace({ pathname: "/chat/[id]" as any, params: { id: convoId } });
  };

  const startTimer = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          stopTimer();
          handleTimeout(); 
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
    }
  };

  const handleTimeout = () => {
    router.replace("/(tabs)/match" as any);
  };

  const handleMatchResult = async (result: "success" | "fail") => {
    if (isLookTab === "true") return;

    stopTimer();
    if (result === "success") {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // 일반 매칭 성공 시에도 대화방 추가
      await addConversation({
        id: convoId || String(Date.now()),
        nickname: profileName || "User",
        gender: "female", 
        age: 20, 
        language: lang, 
        location: "Unknown", 
        distanceKm: 0, 
        isOnline: true,
      });
      router.replace({ pathname: "/chat/[id]" as any, params: { id: convoId } });
    } else {
      Alert.alert(
        t(lang, "match_failed" as any) || "Match Failed", 
        t(lang, "match_failed_desc" as any) || "The other person didn't heart back."
      );
      router.replace("/(tabs)/match" as any);
    }
  };

  const animatedModalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: modalScale.value }],
    opacity: modalOpacity.value,
  }));

  async function handleHeart() {
    if (hasChosen) return;
    setHasChosen(true);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    const socket = (global as any).chatSocket || (window as any).chatSocket;
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({ type: "finish_choice", choice: "heart", matchId: convoId }));
    }

    // 일반 매칭 시 상대방 대기 (둘러보기는 useEffect에서 이미 처리되어 여기 안 들어옴)
  }

  async function handleX() {
    if (hasChosen) return;
    stopTimer();
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const socket = (global as any).chatSocket || (window as any).chatSocket;
    if (socket && socket.readyState === 1) {
      socket.send(JSON.stringify({ type: "finish_choice", choice: "x", matchId: convoId }));
    }
    router.replace("/(tabs)/match" as any);
  }

  // ✅ 둘러보기 모드일 때는 화면을 렌더링하지 않음 (깜빡임 방지)
  if (isLookTab === "true") {
    return (
      <View style={styles.container}>
        <LinearGradient colors={["#0d0d12", "#1a0a15", "#1a1a1f"]} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad, paddingBottom: botPad }]}>
      <LinearGradient
        colors={["#0d0d12", "#1a0a15", "#1a1a1f"]}
        style={StyleSheet.absoluteFill}
      />

      <Animated.View style={[styles.modalCard, animatedModalStyle]}>
        <View style={styles.header}>
          <Text style={styles.callEnded}>{t(lang, "call_ended")}</Text>
          <Text style={styles.title}>
            {t(lang, "how_was_conversation").replace("{name}", profileName || "User")}
          </Text>

          <View style={styles.timerContainer}>
            <Ionicons name="time-outline" size={20} color={Colors.accent} />
            <Text style={styles.timerText}>{timeLeft}s</Text>
          </View>
        </View>

        <Text style={styles.subtitle}>
          {t(lang, "decision_subtitle")}
        </Text>

        {hasChosen ? (
          <View style={styles.waitingContainer}>
            <ActivityIndicator size="small" color={Colors.accent} />
            <Text style={styles.waitTitle}>{t(lang, "waiting_partner" as any)}</Text>
          </View>
        ) : (
          <View style={styles.decisionRow}>
            <View style={styles.btnWrapper}>
              <Pressable 
                style={({ pressed }) => [
                  styles.decisionBtn, 
                  styles.xBtn, 
                  pressed && styles.pressed
                ]} 
                onPress={handleX}
              >
                <Ionicons name="close" size={44} color={Colors.danger} />
              </Pressable>
              <Text style={styles.btnLabel}>{t(lang, "bad_choice")}</Text>
            </View>

            <View style={styles.btnWrapper}>
              <Pressable 
                style={({ pressed }) => [
                  styles.decisionBtn, 
                  styles.heartBtn, 
                  pressed && styles.pressed
                ]} 
                onPress={handleHeart}
              >
                <LinearGradient colors={[Colors.accent, "#c01f5d"]} style={styles.heartGrad}>
                  <Ionicons name="heart" size={42} color="#fff" />
                </LinearGradient>
              </Pressable>
              <Text style={[styles.btnLabel, { color: Colors.accent }]}>
                {t(lang, "good_choice")}
              </Text>
            </View>
          </View>
        )}
      </Animated.View>

      <Text style={styles.footerHint}>{t(lang, "choose_carefully")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "center", 
    paddingHorizontal: 24 
  },
  modalCard: {
    width: '100%',
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    borderRadius: 32,
    padding: 32,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
  },
  header: { 
    alignItems: "center", 
    marginBottom: 16 
  },
  callEnded: { 
    fontSize: 12, 
    fontWeight: "600", 
    color: Colors.textMuted, 
    letterSpacing: 2, 
    textTransform: "uppercase", 
    marginBottom: 8 
  },
  title: { 
    fontSize: 22, 
    fontWeight: "800", 
    color: Colors.textPrimary, 
    textAlign: "center", 
    lineHeight: 30 
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20
  },
  timerText: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.accent
  },
  subtitle: { 
    fontSize: 14, 
    fontWeight: "400", 
    color: Colors.textSecondary, 
    textAlign: "center", 
    lineHeight: 20, 
    marginBottom: 40 
  },
  decisionRow: { 
    flexDirection: "row", 
    gap: 32, 
    alignItems: "center" 
  },
  btnWrapper: { 
    alignItems: 'center', 
    gap: 12 
  },
  decisionBtn: { 
    width: 84, 
    height: 84, 
    borderRadius: 42, 
    overflow: 'hidden', 
    justifyContent: 'center', 
    alignItems: 'center' 
  },
  pressed: { 
    opacity: 0.8, 
    transform: [{ scale: 0.95 }] 
  },
  xBtn: { 
    backgroundColor: "rgba(232, 70, 70, 0.1)", 
    borderWidth: 2, 
    borderColor: Colors.danger 
  },
  heartBtn: { 
    elevation: 8, 
    shadowColor: Colors.accent, 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.3, 
    shadowRadius: 8 
  },
  heartGrad: { 
    width: '100%', 
    height: '100%', 
    alignItems: 'center', 
    justifyContent: 'center' 
  },
  btnLabel: { 
    fontSize: 13, 
    fontWeight: "700", 
    color: Colors.textMuted 
  },
  footerHint: { 
    position: 'absolute', 
    bottom: 50, 
    fontSize: 13, 
    color: Colors.textMuted, 
    fontWeight: "400" 
  },
  waitingContainer: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 20
  },
  waitTitle: {
    fontSize: 16,
    color: Colors.textSecondary,
    fontWeight: '600'
  }
});