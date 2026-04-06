import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  PermissionsAndroid,
  Alert,
  NativeModules,
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
import { db } from "@/constants/firebase";
import { collection, addDoc, doc, updateDoc, arrayUnion } from "firebase/firestore";
import BlockReportModal from "@/components/BlockReportModal";

import { getAgoraEngine, destroyAgoraEngine } from "@/src/services/agoraEngine";
import { AGORA_APP_ID, SERVER_URL } from "@/constants/agora";

const { CallServiceModule } = NativeModules;

const CALL_DURATION_LIMIT = 7 * 60;
const ACTUAL_CALL_LIMIT = 6 * 60;
const TIMER_INTERVAL = CALL_DURATION_LIMIT / ACTUAL_CALL_LIMIT;

function pad(n: number) {
  return String(Math.max(0, Math.floor(n))).padStart(2, "0");
}

function formatTime(secs: number) {
  const absSecs = Math.abs(Math.floor(secs));
  const m = Math.floor(absSecs / 60);
  const s = Math.floor(absSecs % 60);
  return `${secs < 0 ? "-" : ""}${pad(m)}:${pad(s)}`;
}

function uidFromString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 999999 + 1;
}

function firstString(value: string | string[] | undefined, fallback = ""): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return fallback;
}

export default function CallingScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const {
    refreshConversations,
    sendMessage,
    conversations,
    markConversationAsFriend,
  } = useData();

  const lang = useMemo(() => (user?.language || "ko") as Language, [user?.language]);

  const engineRef = useRef<any>(null);
  const localUidRef = useRef<number | null>(null);
  const isEndingRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hasSentNotification = useRef(false);

  const callStateRef = useRef<"connecting" | "active">("connecting");
  const elapsedSecondsRef = useRef(0);

  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  const params = useLocalSearchParams<{
    convoId?: string | string[];
    profileName?: string | string[];
    isAlreadyFriend?: string | string[];
    isLookTab?: string | string[];
    targetToken?: string | string[];
    isReceiver?: string | string[];
    callType?: string | string[];
  }>();

  const convoId = firstString(params.convoId);
  const profileName = firstString(params.profileName, "User");
  const isLookMode = firstString(params.isLookTab) === "true";
  const targetToken = firstString(params.targetToken);
  const isReceiver = firstString(params.isReceiver) === "true";
  const isAlreadyFriendParam = firstString(params.isAlreadyFriend) === "true";
  const rawCallType = firstString(params.callType);

  const convo = conversations.find((c) => c.id === convoId);

  const callType: "random" | "paid" | "friend" =
    rawCallType === "random" || rawCallType === "paid" || rawCallType === "friend"
      ? rawCallType
      : convo?.isFriend || isAlreadyFriendParam
      ? "friend"
      : "paid";

  const isRandomCall = callType === "random";
  const isPaidCall = callType === "paid";
  const isFriendCall = callType === "friend";

  const [timeLeft, setTimeLeft] = useState(isRandomCall ? CALL_DURATION_LIMIT : 0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [callState, setCallState] = useState<"connecting" | "active">("connecting");
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaker, setIsSpeaker] = useState(true);

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.5);

  useEffect(() => {
    pulseScale.value = withRepeat(withTiming(1.4, { duration: 1200 }), -1, true);
    pulseOpacity.value = withRepeat(withTiming(0, { duration: 1200 }), -1, true);

    return () => {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
    };
  }, []);

  useEffect(() => {
    setTimeLeft(isRandomCall ? CALL_DURATION_LIMIT : 0);
    setElapsedSeconds(0);
    elapsedSecondsRef.current = 0;
  }, [isRandomCall]);

  useEffect(() => {
    if (!convoId) return;
    if (!isPaidCall) return;

    markConversationAsFriend(convoId, "paid").catch((e) => {
      console.log("paid 친구 처리 실패:", e);
    });
  }, [convoId, isPaidCall]);

  async function startForegroundCallService(title?: string, text?: string) {
    if (Platform.OS !== "android") return;
    if (!CallServiceModule?.start) return;

    try {
      await CallServiceModule.start(
        title ?? "통화 진행 중",
        text ?? "앱 밖에서도 통화를 유지합니다"
      );
    } catch (e) {
      console.log("[CallService] start error:", e);
    }
  }

  async function stopForegroundCallService() {
    if (Platform.OS !== "android") return;
    if (!CallServiceModule?.stop) return;

    try {
      await CallServiceModule.stop();
    } catch (e) {
      console.log("[CallService] stop error:", e);
    }
  }

  async function safeDestroyEngine() {
    if (!engineRef.current) return;

    try {
      engineRef.current.leaveChannel();
    } catch (e) {
      console.log("[Agora] leaveChannel error:", e);
    }

    try {
      destroyAgoraEngine();
    } catch (e) {
      console.log("[Agora] release error:", e);
    }

    engineRef.current = null;
  }

  async function handleEndCall() {
    if (isEndingRef.current) return;
    isEndingRef.current = true;

    try {
      await safeDestroyEngine();
    } catch (err) {
      try {
        await engineRef.current?.leaveChannel();
      } catch (e) {}
      engineRef.current = null;
    }

    await stopForegroundCallService();

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    } catch (e) {}

    try {
      if (convoId && user?.id) {
        const wasConnected = callStateRef.current === "active";
        const callDuration = elapsedSecondsRef.current;

        if (wasConnected) {
          const minutes = Math.floor(callDuration / 60);
          const seconds = callDuration % 60;
          const durationText =
            minutes > 0 ? `📞 통화 ${minutes}분 ${seconds}초` : `📞 통화 ${seconds}초`;

          await sendMessage(convoId, user.id, durationText, "call");
        } else {
          await sendMessage(convoId, user.id, "📵 부재중 통화", "missed_call");
        }
      }
    } catch (e) {}

    try {
      await refreshConversations();
    } catch (e) {}

    try {
      if (isLookMode) {
        router.replace("/(tabs)/chat" as any);
      } else if (isRandomCall) {
        router.replace({
          pathname: "/matching/decision",
          params: { convoId: convoId ?? "", profileName: profileName ?? "" },
        });
      } else {
        router.canGoBack()
          ? router.back()
          : router.replace("/(tabs)/chat" as any);
      }
    } catch (e) {}
  }

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

      await engine.initialize({ appId: AGORA_APP_ID, channelProfile: 1 });
      engine.setClientRole(1);
      engine.enableAudio();
      engine.setEnableSpeakerphone(true);

      await startForegroundCallService(
        "통화 진행 중",
        `${profileName}님과 통화 중`
      );

      registerAgoraEvents(engine);
      await joinAgoraChannel();
    }

    initAgora();

    return () => {
      void safeDestroyEngine();
      void stopForegroundCallService();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  async function joinAgoraChannel() {
    try {
      if (!convoId) return;

      const uid = user?.id
        ? uidFromString(user.id)
        : Math.floor(Math.random() * 999999) + 1;

      const res = await fetch(`${SERVER_URL}/rtc-token?channelName=${convoId}&uid=${uid}`);
      const { token } = await res.json();

      localUidRef.current = uid;
      await engineRef.current?.joinChannel(token, convoId, uid, {});
      engineRef.current?.muteLocalAudioStream(false);
      engineRef.current?.enableLocalAudio(true);
    } catch (e) {
      console.log("❌ Agora 채널 입장 실패:", e);
    }
  }

  function registerAgoraEvents(engine: any) {
    engine.registerEventHandler({
      onJoinChannelSuccess(connection: any) {
        if (connection?.localUid) {
          localUidRef.current = connection.localUid;
        }
      },
      onUserJoined(connection: any, remoteUid: number) {
        if (remoteUid === localUidRef.current) return;

        callStateRef.current = "active";
        setCallState("active");
        startTimer();
      },
      onUserOffline(connection: any, remoteUid: number) {
        if (remoteUid === localUidRef.current) return;
        handleEndCall();
      },
      onLeaveChannel() {},
      onError(err: number, msg: string) {
        console.log("[Agora Event] onError:", err, msg);
      },
    });
  }

  useEffect(() => {
    if (isReceiver) return;
    if (!targetToken) return;
    if (hasSentNotification.current) return;

    sendNotification(targetToken);
  }, [targetToken, isReceiver, callType]);

  const sendNotification = async (token: string) => {
    try {
      const fullUrl = `${SERVER_URL}/send-call-notification`.replace(
        /([^:]\/)\/+/g,
        "$1"
      );

      const response = await fetch(fullUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetToken: token,
          callerName: user?.nickname ?? "User",
          callerId: user?.id,
          convoId,
          callerToken: user?.fcmToken,
          callType,
        }),
      });

      const resData = await response.json();
      hasSentNotification.current = Boolean(response.ok && resData.success);
    } catch (error) {
      hasSentNotification.current = false;
    }
  };

  function startTimer() {
    if (timerRef.current) return;

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => {
        const next = prev + 1;
        elapsedSecondsRef.current = next;
        return next;
      });

      if (isRandomCall) {
        setTimeLeft((prev) => {
          const next = prev - TIMER_INTERVAL;

          if (next <= 0) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            handleEndCall();
            return 0;
          }

          return next;
        });
      }
    }, 1000);
  }

  async function handleBlock(withReport: boolean) {
    setShowBlockModal(false);

    if (user?.id && convo?.matchedUser?.id) {
      try {
        await updateDoc(doc(db, "users", user.id), {
          blockedUsers: arrayUnion(convo.matchedUser.id),
        });

        if (withReport && blockReason) {
          await addDoc(collection(db, "reports"), {
            reporterId: user.id,
            reportedId: convo.matchedUser.id,
            reason: blockReason,
            createdAt: Date.now(),
          });
        }
      } catch (e) {
        console.log("차단/신고 실패:", e);
      }
    }

    setBlockReason(null);
    handleEndCall();
  }

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const progressPct = isRandomCall
    ? Math.max(0, (timeLeft / CALL_DURATION_LIMIT) * 100)
    : 0;

  const isWarning = isRandomCall && timeLeft <= 70;
  const timerDisplay = isRandomCall ? formatTime(timeLeft) : formatTime(elapsedSeconds);

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
        {callState === "connecting" ? t(lang, "connecting") : t(lang, "connected")}
      </Text>

      <View style={styles.avatarSection}>
        <Animated.View style={[styles.pulseRing, pulseStyle]} />
        <View style={styles.avatarOuter}>
          <LinearGradient colors={[Colors.accent, "#c01f5d"]} style={styles.avatarGrad}>
            <Ionicons name="person" size={56} color="#fff" />
          </LinearGradient>
        </View>
      </View>

      <Text style={styles.callerName}>{profileName}</Text>

      <Pressable style={styles.blockBtn} onPress={() => setShowBlockModal(true)}>
        <Ionicons name="ban-outline" size={16} color={Colors.danger} />
        <Text style={styles.blockBtnText}>차단/신고</Text>
      </Pressable>

      {callState === "active" ? (
        <View style={styles.timerContainer}>
          {isRandomCall && (
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
            {timerDisplay}
          </Text>

          <Text style={styles.callTypeText}>
            {isRandomCall
              ? "랜덤 매칭 통화"
              : isPaidCall
              ? "유료 통화"
              : isFriendCall
              ? "친구 통화"
              : ""}
          </Text>
        </View>
      ) : (
        <View style={styles.connectingDots}>
          <Text style={styles.connectingText}>{t(lang, "waiting_for_partner")}</Text>
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
          <LinearGradient colors={[Colors.danger, "#b01010"]} style={styles.endCallBtnGrad}>
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

      <BlockReportModal
        visible={showBlockModal}
        onClose={() => {
          setShowBlockModal(false);
          setBlockReason(null);
        }}
        onConfirm={handleBlock}
        selectedReason={blockReason}
        onSelectReason={setBlockReason}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 40,
    paddingHorizontal: 24,
  },
  status: {
    fontSize: 14,
    color: Colors.textMuted,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  avatarSection: {
    alignItems: "center",
    justifyContent: "center",
    width: 180,
    height: 180,
  },
  pulseRing: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 85,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  avatarOuter: {
    width: 130,
    height: 130,
    borderRadius: 65,
    overflow: "hidden",
    borderWidth: 3,
    borderColor: Colors.border,
  },
  avatarGrad: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  callerName: {
    fontSize: 32,
    fontWeight: "800",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  blockBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.danger,
    backgroundColor: "rgba(255,50,50,0.08)",
  },
  blockBtnText: {
    color: Colors.danger,
    fontSize: 13,
    fontWeight: "700",
  },
  timerContainer: {
    width: "100%",
    alignItems: "center",
    gap: 10,
  },
  progressBar: {
    width: "100%",
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  timerText: {
    fontSize: 48,
    fontWeight: "800",
    color: Colors.textPrimary,
    letterSpacing: -2,
  },
  timerWarning: {
    color: Colors.danger,
  },
  callTypeText: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
    width: "100%",
    justifyContent: "center",
  },
  controlBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  controlBtnActive: {
    backgroundColor: "rgba(232,70,124,0.15)",
    borderColor: Colors.accent,
  },
  endCallBtn: {
    borderRadius: 40,
    overflow: "hidden",
  },
  endCallBtnGrad: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  connectingDots: {
    alignItems: "center",
  },
  connectingText: {
    color: Colors.textSecondary,
    fontSize: 16,
  },
});