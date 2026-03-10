import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  PermissionsAndroid,
  Alert,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  cancelAnimation,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Colors } from "@/constants/colors";
import { t, Language } from "@/constants/i18n";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";

import { getAgoraEngine, destroyAgoraEngine } from "@/src/services/agoraEngine";
import { AGORA_APP_ID, SERVER_URL } from "@/constants/agora";

const CALL_DURATION_LIMIT = 7 * 60;

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function formatTime(secs: number) {
  const absSecs = Math.abs(secs);
  const m = Math.floor(absSecs / 60);
  const s = absSecs % 60;
  return `${secs < 0 ? "-" : ""}${pad(m)}:${pad(s)}`;
}

function uidFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 999999 + 1; // 0 방지, 최대 999999
}
export default function CallingScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { refreshConversations } = useData();
  const lang = useMemo(() => (user?.language || "ko") as Language, [user?.language]);

  // Agora 엔진
  const engineRef = useRef<any>(null);
const localUidRef = useRef<number | null>(null);
const isEndingRef = useRef(false); // 중복 종료 방지 플래그

// 안전하게 엔진 정리하는 헬퍼
async function safeDestroyEngine() {
  if (!engineRef.current) return;

  try {
    engineRef.current.leaveChannel();
    console.log("[Agora] leaveChannel() called");
  } catch (e) {
    console.log("[Agora] leaveChannel error:", e);
  }

  try {
    destroyAgoraEngine();
    console.log("[Agora] engine.release() called");
  } catch (e) {
    console.log("[Agora] release error:", e);
  }

  engineRef.current = null;
}


  const params = useLocalSearchParams<{
    convoId: string;
    profileName: string;
    isAlreadyFriend: string;
    isLookTab?: string;
    targetToken?: string;
    isReceiver?: string;
  }>();

  const convoId = params.convoId;
  const profileName = params.profileName ?? "User";
  const isFriend = params.isAlreadyFriend === "true";
  const isLookMode = params.isLookTab === "true";
  const targetToken = params.targetToken;

  const [timeLeft, setTimeLeft] = useState(CALL_DURATION_LIMIT);
  const [callState, setCallState] = useState<"connecting" | "active">("connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSentNotification = useRef(false);

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.5);

  // UI 애니메이션
  useEffect(() => {
    pulseScale.value = withRepeat(withTiming(1.4, { duration: 1200 }), -1, true);
    pulseOpacity.value = withRepeat(withTiming(0, { duration: 1200 }), -1, true);

    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
    };
  }, []);

  // Agora 초기화
  useEffect(() => {
    async function initAgora() {
  console.log("🎧 Agora 엔진 초기화 시작");

  if (Platform.OS === "android") {
    const granted = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
    );
    if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
      Alert.alert(
        t(lang, "permission_denied_title"),
        t(lang, "permission_denied_msg")
      );
      return;
    }
  }

  const engine = getAgoraEngine();
  engineRef.current = engine;

  await engine.initialize({
    appId: AGORA_APP_ID,
    channelProfile: 1, // LiveBroadcasting
  });
  console.log("[Agora] engine initialized");

  engine.setClientRole(1); // Broadcaster
  engine.enableAudio();
  engine.setEnableSpeakerphone(true);

  // 이벤트 등록 먼저, 그 다음 채널 입장
  registerAgoraEvents(engine);
  await joinAgoraChannel();
}

    initAgora();

    return () => {
  console.log("📞 Agora 엔진 종료");

  // 비동기 정리 호출(리턴 콜백은 async일 수 없으므로 비동기 함수 호출만)
  void safeDestroyEngine();

  if (timerRef.current) clearInterval(timerRef.current);
};
  }, []);

  // 서버에서 토큰 받아오기 + joinChannel
  async function joinAgoraChannel() {
  try {
    const uid = user?.id ? uidFromString(user.id) : Math.floor(Math.random() * 999999) + 1;
    console.log("🔑 Agora 토큰 요청 (channelName):", convoId, "localUserId:", user?.id, "→ uid:", uid);

    const res = await fetch(`${SERVER_URL}/rtc-token?channelName=${convoId}&uid=${uid}`);
    const { token } = await res.json();
    console.log("🔑 토큰 수신 완료, tokenExists:", !!token, "uid:", uid);

    localUidRef.current = uid;

    // v4 API: joinChannel(token, channelName, uid, options)
    await engineRef.current?.joinChannel(token, convoId, uid, {});
    console.log("📡 채널 입장 완료, channel:", convoId, "uid:", uid);

    engineRef.current?.muteLocalAudioStream(false);
    engineRef.current?.enableLocalAudio(true);
    console.log("[Agora] local audio enabled");
  } catch (e) {
    console.log("❌ Agora 채널 입장 실패:", e);
  }
}

  // Agora 이벤트 등록
  function registerAgoraEvents(engine: any) {
  console.log("[Agora] registerAgoraEvents called");

  engine.registerEventHandler({
    onJoinChannelSuccess(connection: any, elapsed: number) {
      console.log("[Agora Event] onJoinChannelSuccess uid:", connection?.localUid, "elapsed:", elapsed);
      if (connection?.localUid) {
        localUidRef.current = connection.localUid;
      }
    },

    onUserJoined(connection: any, remoteUid: number, elapsed: number) {
      console.log("[Agora Event] onUserJoined remoteUid:", remoteUid, "localUid:", localUidRef.current);

      if (remoteUid === localUidRef.current) {
        console.log("[Agora] 자기 자신 uid — 무시");
        return;
      }

      console.log("✅ 상대방 입장 확인! 통화 시작");
      setCallState("active");
      startTimer();
    },

    onUserOffline(connection: any, remoteUid: number, reason: number) {
      console.log("[Agora Event] onUserOffline remoteUid:", remoteUid, "reason:", reason);

      if (remoteUid === localUidRef.current) return;

      console.log("📴 상대방 퇴장 — 통화 종료");
      handleEndCall();
    },

    onLeaveChannel(connection: any, stats: any) {
      console.log("[Agora Event] onLeaveChannel stats:", stats);
    },

    onError(err: number, msg: string) {
      console.log("[Agora Event] onError:", err, msg);
    },
  });
}

  // ✅ 1. 발신자 전용 FCM 알림 전송 로직 (수정본)
  useEffect(() => {
    // 수신자 모드이면 알림을 보낼 필요가 없음
    if (params.isReceiver === "true") {
      console.log("📵 [Calling] 수신자 모드: 알림 전송 스킵");
      return;
    }

    // 핵심 수정: targetToken이 감지될 때까지 기다렸다가, 들어오는 순간 딱 한 번 실행
    if (targetToken && !hasSentNotification.current) {
      console.log("🚀 [Calling] 알림 전송 조건 충족! 서버로 요청을 보냅니다.");
      sendNotification(targetToken);
    }
  }, [targetToken]); // 👈 빈 배열 []에서 [targetToken]으로 변경하여 토큰 로딩 대응

  // ✅ 2. 서버로 알림 요청을 보내는 함수
  const sendNotification = async (token: string) => {
    try {
      // 주소 슬래시(/) 중복 방지 처리된 URL 생성
      const fullUrl = `${SERVER_URL}/send-call-notification`.replace(/([^:]\/)\/+/g, "$1");
      console.log("🔗 서버 요청 주소:", fullUrl);

      const response = await fetch(fullUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetToken: token,
          callerName: user?.nickname ?? "User",
          callerId: user?.id,
          convoId: convoId,
          callerToken: user?.fcmToken,
        }),
      });

      const resData = await response.json();

      if (response.ok && resData.success) {
        hasSentNotification.current = true; // ✅ 전송 성공 시에만 완료 표시
        console.log("✅ [Calling] 서버 알림 발송 승인 완료");
      } else {
        console.log("❌ [Calling] 서버 응답 에러:", resData);
        hasSentNotification.current = false;
      }
    } catch (error) {
      console.error("🔥 [Calling] 서버 통신 중 네트워크 에러:", error);
      hasSentNotification.current = false;
    }
  };

  // 타이머
  function startTimer() {
    if (timerRef.current) return;

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        const next = prev - 1;

        if (isFriend) return next;

        if (next <= 0) {
          if (timerRef.current) clearInterval(timerRef.current);
          handleEndCall();
          return 0;
        }

        return next;
      });
    }, 1000);
  }

  // 통화 종료
  async function handleEndCall() {
  // 중복 호출 방지
  if (isEndingRef.current) {
    console.log("[Calling] handleEndCall already running — ignoring duplicate call");
    return;
  }
  isEndingRef.current = true;

  console.log("[Calling] handleEndCall called, engineRef exists:", !!engineRef.current, "localUid:", localUidRef.current, "callState:", callState);

  try {
    await safeDestroyEngine();
  } catch (err) {
    console.log("[Calling] handleEndCall safeDestroyEngine error:", err);
    try { await engineRef.current?.leaveChannel(); } catch (e) { console.log("[Calling] fallback leaveChannel error:", e); }
    engineRef.current = null;
  }

  if (timerRef.current) {
    clearInterval(timerRef.current);
    timerRef.current = null;
  }

  try {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  } catch (e) {
    console.log("[Calling] Haptics error:", e);
  }

  try {
    await refreshConversations();
  } catch (e) {
    console.log("[Calling] refreshConversations failed:", e);
  }

  try {
    if (isLookMode) {
      router.replace("/(tabs)/chat" as any);
    } else if (isFriend) {
      router.canGoBack() ? router.back() : router.replace("/(tabs)/chat" as any);
    } else {
      router.replace({
        pathname: "/matching/decision",
        params: { convoId: convoId ?? "", profileName: profileName ?? "" },
      });
    }
  } catch (navErr) {
    console.log("[Calling] navigation error after end call:", navErr);
  }
}

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const progressPct = isFriend
    ? 100
    : Math.max(0, (timeLeft / CALL_DURATION_LIMIT) * 100);
  const isWarning = !isFriend && timeLeft <= 60;

  return (
    <View
      style={[
        styles.container,
        { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 },
      ]}
    >
      <LinearGradient
        colors={["#0d0d12", "#1a0a15", "#1a1a1f"]}
        style={StyleSheet.absoluteFill}
      />

      <Text style={styles.status}>
        {callState === "connecting"
          ? t(lang, "connecting")
          : t(lang, "connected")}
      </Text>

      <View style={styles.avatarSection}>
        <Animated.View style={[styles.pulseRing, pulseStyle]} />
        <View style={styles.avatarOuter}>
          <LinearGradient
            colors={[Colors.accent, "#c01f5d"]}
            style={styles.avatarGrad}
          >
            <Ionicons name="person" size={56} color="#fff" />
          </LinearGradient>
        </View>
      </View>

      <Text style={styles.callerName}>{profileName}</Text>

      {callState === "active" ? (
        <View style={styles.timerContainer}>
          {!isFriend && (
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progressPct}%`,
                    backgroundColor: isWarning ? Colors.danger : Colors.accent,
                  },
                ]}
              />
            </View>
          )}
          <Text style={[styles.timerText, isWarning && styles.timerWarning]}>
            {formatTime(timeLeft)}
          </Text>
        </View>
      ) : (
        <View style={styles.connectingDots}>
          <Text style={styles.connectingText}>
            {t(lang, "waiting_for_partner")}
          </Text>
        </View>
      )}

      <View style={styles.controls}>
        <Pressable
          style={[styles.controlBtn, isMuted && styles.controlBtnActive]}
          onPress={() => {
            const next = !isMuted;
            setIsMuted(next);
            engineRef.current?.muteLocalAudioStream(next);
          }}
        >
          <Ionicons
            name={isMuted ? "mic-off" : "mic"}
            size={24}
            color={isMuted ? Colors.accent : Colors.textPrimary}
          />
        </Pressable>

        <Pressable style={styles.endCallBtn} onPress={handleEndCall}>
          <LinearGradient
            colors={[Colors.danger, "#b01010"]}
            style={styles.endCallBtnGrad}
          >
            <Ionicons
              name="call"
              size={30}
              color="#fff"
              style={{ transform: [{ rotate: "135deg" }] }}
            />
          </LinearGradient>
        </Pressable>

        <Pressable
          style={[styles.controlBtn, isSpeaker && styles.controlBtnActive]}
          onPress={() => {
            const next = !isSpeaker;
            setIsSpeaker(next);
            engineRef.current?.setEnableSpeakerphone(next);
          }}
        >
          <Ionicons
            name={isSpeaker ? "volume-high" : "volume-mute"}
            size={24}
            color={isSpeaker ? Colors.accent : Colors.textPrimary}
          />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "space-between", paddingVertical: 40, paddingHorizontal: 24 },
  status: { fontSize: 14, color: Colors.textMuted, letterSpacing: 1, textTransform: "uppercase" },
  avatarSection: { alignItems: "center", justifyContent: "center", width: 180, height: 180 },
  pulseRing: { position: "absolute", width: 170, height: 170, borderRadius: 85, borderWidth: 2, borderColor: Colors.accent },
  avatarOuter: { width: 130, height: 130, borderRadius: 65, overflow: "hidden", borderWidth: 3, borderColor: Colors.border },
  avatarGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  callerName: { fontSize: 32, fontWeight: "800", color: Colors.textPrimary, textAlign: "center" },
  timerContainer: { width: "100%", alignItems: "center", gap: 10 },
  progressBar: { width: "100%", height: 4, backgroundColor: Colors.border, borderRadius: 2, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  timerText: { fontSize: 48, fontWeight: "800", color: Colors.textPrimary, letterSpacing: -2 },
  timerWarning: { color: Colors.danger },
  controls: { flexDirection: "row", alignItems: "center", gap: 24, width: "100%", justifyContent: "center" },
  controlBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: Colors.backgroundCard, borderWidth: 1, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  controlBtnActive: { backgroundColor: "rgba(232,70,124,0.15)", borderColor: Colors.accent },
  endCallBtn: { borderRadius: 40, overflow: "hidden" },
  endCallBtnGrad: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center" },
  connectingDots: { alignItems: "center" },
  connectingText: { color: Colors.textSecondary, fontSize: 16 },
});