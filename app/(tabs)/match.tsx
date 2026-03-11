import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, Pressable, Platform,
  Modal, FlatList, Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring,
  withRepeat, withTiming, cancelAnimation,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth, Gender } from "@/contexts/AuthContext";
import { useData, MatchHistory } from "@/contexts/DataContext";
import { Colors } from "@/constants/colors";
import { t, Language } from "@/constants/i18n";
import { db } from "@/constants/firebase";
import {
  collection, doc, setDoc, deleteDoc, onSnapshot,
  query, where, getDocs, getDoc, serverTimestamp,
} from "firebase/firestore";

const UNLOCK_COST = 10;
const MATCHED_USERS_KEY = "@nighton_matched_users";

type MatchState = "idle" | "searching" | "matched";

// 두 좌표 사이 거리 계산 (km)
function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function getMatchedUserIds(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(MATCHED_USERS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

async function saveMatchedUserId(userId: string) {
  try {
    const current = await getMatchedUserIds();
    if (!current.includes(userId)) {
      await AsyncStorage.setItem(MATCHED_USERS_KEY, JSON.stringify([...current, userId]));
    }
  } catch {}
}

export default function MatchScreen() {
  const insets = useSafeAreaInsets();
  const { user, spendseeds } = useAuth();
  const { addConversation, matchHistories, addMatchHistory, unlockMatchHistory } = useData();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const lang = (user?.language || "en") as Language;

  const [matchState, setMatchState] = useState<MatchState>("idle");
  const [matchedProfile, setMatchedProfile] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const matchListenerRef = useRef<(() => void) | null>(null);

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0.4);
  const btnScale = useSharedValue(1);
  const btnRotate = useSharedValue(0);

  useEffect(() => {
    if (matchState === "searching") {
      pulseScale.value = withRepeat(withTiming(2.4, { duration: 1100 }), -1, true);
      pulseOpacity.value = withRepeat(withTiming(0, { duration: 1100 }), -1, true);
      btnRotate.value = withRepeat(withTiming(360, { duration: 3000 }), -1, false);
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

  // 대기열에서 제거 + 리스너 해제
  async function cancelMatching() {
    if (user?.id) {
      try { await deleteDoc(doc(db, "matchQueue", user.id)); } catch {}
    }
    if (matchListenerRef.current) {
      matchListenerRef.current();
      matchListenerRef.current = null;
    }
    if (searchTimer.current) {
      clearTimeout(searchTimer.current);
      searchTimer.current = null;
    }
  }

  async function handleStartMatching() {
    if (matchState === "searching") {
      setMatchState("idle");
      await cancelMatching();
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    btnScale.value = withSpring(0.9, {}, () => { btnScale.value = withSpring(1); });
    setMatchState("searching");
    await startFirestoreMatching();
  }

  async function startFirestoreMatching() {
    if (!user?.id) return;

    try {
      // 1. 내 위치 가져오기
      let myCoords = user.locationCoords;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        myCoords = { lat: loc.coords.latitude, lon: loc.coords.longitude };
      }

      // 2. 이미 만난 유저 목록
      const matchedIds = await getMatchedUserIds();

      // 3. 대기열에 내 정보 등록
      const queueRef = doc(db, "matchQueue", user.id);
      await setDoc(queueRef, {
        userId: user.id,
        gender: user.gender,
        lat: myCoords?.lat ?? 0,
        lon: myCoords?.lon ?? 0,
        matchDistance: user.matchDistance ?? 5000,
        fcmToken: user.fcmToken ?? "",
        nickname: user.nickname,
        age: user.age,
        profilePhoto: user.profilePhoto ?? "",
        language: user.language,
        createdAt: serverTimestamp(),
        matchedWith: null,
      });

      // 4. 반대 성별 대기열에서 상대방 찾기
      const oppositeGender = user.gender === "male" ? "female" : "male";
      const queueSnap = await getDocs(
        query(collection(db, "matchQueue"), where("gender", "==", oppositeGender))
      );

      let foundMatch: any = null;
      for (const d of queueSnap.docs) {
        if (d.id === user.id) continue;
        const data = d.data();
        if (matchedIds.includes(data.userId)) continue; // 이미 만난 사람 제외
        if (data.matchedWith !== null) continue; // 이미 매칭된 사람 제외

        // 거리 체크
        const myDist = user.matchDistance ?? 5000;
        const theirDist = data.matchDistance ?? 5000;
        if (myCoords && data.lat && data.lon) {
          const dist = calcDistance(myCoords.lat, myCoords.lon, data.lat, data.lon);
          if (dist > myDist || dist > theirDist) continue;
        }

        foundMatch = { id: d.id, ...data };
        break;
      }

      if (foundMatch) {
        // 5. 매칭 성공
        await setDoc(doc(db, "matchQueue", user.id), { matchedWith: foundMatch.userId }, { merge: true });
        await setDoc(doc(db, "matchQueue", foundMatch.userId), { matchedWith: user.id }, { merge: true });
        await saveMatchedUserId(foundMatch.userId);
        await deleteDoc(doc(db, "matchQueue", user.id));

        const profile = {
          id: foundMatch.userId,
          nickname: foundMatch.nickname,
          gender: foundMatch.gender,
          age: foundMatch.age,
          language: foundMatch.language,
          location: "",
          distanceKm: myCoords && foundMatch.lat
            ? Math.round(calcDistance(myCoords.lat, myCoords.lon, foundMatch.lat, foundMatch.lon))
            : 0,
          profilePhoto: foundMatch.profilePhoto ?? "",
          isOnline: true,
          fcmToken: foundMatch.fcmToken,
        };

        setMatchedProfile(profile);
        setMatchState("matched");
        await addMatchHistory(profile);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      } else {
        // 6. 상대방 없으면 대기 - 누군가 나를 찾을 때까지 리스닝
        matchListenerRef.current = onSnapshot(queueRef, async (snap) => {
          if (!snap.exists()) return;
          const data = snap.data();
          if (!data.matchedWith) return;

          // 매칭됨!
          matchListenerRef.current?.();
          matchListenerRef.current = null;

          const partnerSnap = await getDoc(doc(db, "matchQueue", data.matchedWith));
          const partnerData = partnerSnap.exists() ? partnerSnap.data() : null;
          if (!partnerData) return;

          await saveMatchedUserId(data.matchedWith);
          await deleteDoc(doc(db, "matchQueue", user.id));

          const profile = {
            id: data.matchedWith,
            nickname: partnerData.nickname,
            gender: partnerData.gender,
            age: partnerData.age,
            language: partnerData.language,
            location: "",
            distanceKm: myCoords && partnerData.lat
              ? Math.round(calcDistance(myCoords.lat, myCoords.lon, partnerData.lat, partnerData.lon))
              : 0,
            profilePhoto: partnerData.profilePhoto ?? "",
            isOnline: true,
            fcmToken: partnerData.fcmToken,
          };

          setMatchedProfile(profile);
          setMatchState("matched");
          await addMatchHistory(profile);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        });
      }
    } catch (e) {
      console.error("매칭 오류:", e);
      setMatchState("idle");
    }
  }

  async function acceptMatch() {
    if (!matchedProfile) return;
    const convoId = [user?.id, matchedProfile.id].sort().join("_");
    const pName = matchedProfile.nickname;
    const tToken = matchedProfile.fcmToken || "";

    setMatchState("idle");
    setMatchedProfile(null);

    router.push({
      pathname: "/matching/calling",
      params: {
        convoId,
        profileName: pName,
        targetToken: tToken,
        isAlreadyFriend: "false",
        isLookTab: "false",
        isReceiver: "false",
      },
    });
  }

  function declineMatch() {
    setMatchState("idle");
    setMatchedProfile(null);
  }

  async function handleUnlock(item: MatchHistory) {
    if (item.isUnlocked) return;
    Alert.alert(
      lang === "ko" ? "프로필 공개" : "Unlock Profile",
      lang === "ko" ? `${UNLOCK_COST} 코인으로 이 프로필을 공개할까요?` : `Use ${UNLOCK_COST} seeds to unlock this profile?`,
      [
        { text: lang === "ko" ? "취소" : "Cancel", style: "cancel" },
        {
          text: lang === "ko" ? "공개하기" : "Unlock",
          onPress: async () => {
            const ok = await spendseeds(UNLOCK_COST);
            if (!ok) {
              Alert.alert(
                lang === "ko" ? "코인 부족" : "Not enough seeds",
                lang === "ko" ? `${UNLOCK_COST} 코인이 필요합니다.` : `You need ${UNLOCK_COST} seeds.`
              );
              return;
            }
            await unlockMatchHistory(item.id);
            await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          }
        }
      ]
    );
  }

  function renderHistoryItem({ item, index }: { item: MatchHistory; index: number }) {
    const isFirst = index === 0;
    const isUnlocked = item.isUnlocked || isFirst;

    return (
      <View style={styles.historyItem}>
        <View style={styles.historyAvatar}>
          <LinearGradient
            colors={item.profile.gender === "female" ? [Colors.accent, "#c01f5d"] : [Colors.blue, "#2255aa"]}
            style={styles.historyAvatarGrad}
          >
            <Ionicons name={item.profile.gender === "female" ? "female" : "male"} size={24} color="#fff" />
          </LinearGradient>
        </View>

        <View style={styles.historyInfo}>
          <Text style={styles.historyName}>{isUnlocked ? item.profile.nickname : "???"}</Text>
          <Text style={styles.historySub}>
            {isUnlocked ? `${item.profile.age}세 · ${item.profile.distanceKm}km` : "잠김"}
          </Text>
          <Text style={styles.historyDate}>{new Date(item.matchedAt).toLocaleDateString()}</Text>
        </View>

        {!isUnlocked && (
          <Pressable style={styles.unlockBtn} onPress={() => handleUnlock(item)}>
            <LinearGradient colors={[Colors.gold, "#b8860b"]} style={styles.unlockBtnGrad}>
              <Ionicons name="lock-open" size={14} color="#fff" />
              <Text style={styles.unlockBtnText}>{UNLOCK_COST}</Text>
              <Ionicons name="star" size={12} color="#fff" />
            </LinearGradient>
          </Pressable>
        )}

        {!isUnlocked && (
          <BlurView intensity={18} style={StyleSheet.absoluteFill} tint="dark" pointerEvents="none" />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t(lang, "match")}</Text>
        <Pressable style={styles.historyBtn} onPress={() => setShowHistory(true)}>
          <Ionicons name="time-outline" size={22} color={Colors.textPrimary} />
          {matchHistories.length > 0 && (
            <View style={styles.historyBadge}>
              <Text style={styles.historyBadgeText}>
                {matchHistories.length > 99 ? "99+" : matchHistories.length}
              </Text>
            </View>
          )}
        </Pressable>
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
                  <Text style={styles.matchBtnText}>{t(lang, "start_matching")}</Text>
                </LinearGradient>
              </Pressable>
            </Animated.View>
            <Text style={styles.matchHint}>{t(lang, "match_hint")}</Text>
          </View>
        )}

        {matchState === "searching" && (
          <View style={styles.searchingContainer}>
            <Animated.View style={[styles.searchPulse, pulseStyle]} />
            <Animated.View style={[styles.searchPulse2, pulseStyle]} />
            <View style={styles.searchOrb}>
              <LinearGradient colors={[Colors.accent, "#c01f5d"]} style={styles.searchOrbGrad}>
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
            <Text style={styles.matchedTitle}>{t(lang, "match_success")}</Text>
            <View style={styles.matchedAvatar}>
              <LinearGradient
                colors={matchedProfile.gender === "female" ? [Colors.accent, "#c01f5d"] : [Colors.blue, "#2255aa"]}
                style={styles.matchedAvatarGrad}
              >
                <Ionicons name={matchedProfile.gender === "female" ? "female" : "male"} size={44} color="#fff" />
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
                <LinearGradient colors={[Colors.accent, "#c01f5d"]} style={styles.acceptBtnGrad}>
                  <Ionicons name="call" size={28} color="#fff" />
                  <Text style={styles.acceptText}>{t(lang, "start_call")}</Text>
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
            <Text style={styles.infoTitle}>{t(lang, "info_free_call_title")}</Text>
            <Text style={styles.infoDesc}>{t(lang, "info_free_call_desc")}</Text>
          </View>
        </View>
        <View style={styles.infoCard}>
          <Ionicons name="heart-outline" size={20} color={Colors.accent} />
          <View style={styles.infoText}>
            <Text style={styles.infoTitle}>{t(lang, "info_heart_title")}</Text>
            <Text style={styles.infoDesc}>{t(lang, "info_heart_desc")}</Text>
          </View>
        </View>
      </View>

      {/* Match History 모달 */}
      <Modal visible={showHistory} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowHistory(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {lang === "ko" ? "매치 히스토리" : "Match History"}
            </Text>
            <Pressable onPress={() => setShowHistory(false)} hitSlop={15}>
              <Ionicons name="close" size={24} color={Colors.textPrimary} />
            </Pressable>
          </View>

          {matchHistories.length === 0 ? (
            <View style={styles.emptyHistory}>
              <Ionicons name="time-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyHistoryText}>
                {lang === "ko" ? "아직 매칭 기록이 없어요" : "No match history yet"}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.historyHint}>
                {lang === "ko"
                  ? `첫 번째 프로필은 무료로 공개돼요. 나머지는 ${UNLOCK_COST} 코인으로 공개할 수 있어요.`
                  : `First profile is free. Unlock others with ${UNLOCK_COST} seeds.`}
              </Text>
              <FlatList
                data={matchHistories}
                keyExtractor={(item) => item.id}
                renderItem={renderHistoryItem}
                contentContainerStyle={{ paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
              />
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 8, paddingTop: 8,
  },
  headerTitle: { fontSize: 28, fontWeight: "800", color: Colors.textPrimary },
  historyBtn: { padding: 8, position: "relative" },
  historyBadge: {
    position: "absolute", top: 2, right: 2,
    backgroundColor: Colors.accent, borderRadius: 8,
    minWidth: 16, height: 16, alignItems: "center", justifyContent: "center", paddingHorizontal: 3,
  },
  historyBadgeText: { color: "#fff", fontSize: 9, fontWeight: "800" },
  centerSection: { flex: 1, alignItems: "center", justifyContent: "center" },
  idleContainer: { alignItems: "center", gap: 24 },
  pulseRing: {
    position: "absolute", width: 200, height: 200,
    borderRadius: 100, borderWidth: 2, borderColor: Colors.accent,
  },
  matchBtn: {
    width: 160, height: 160, borderRadius: 80,
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  matchBtnText: { color: "#fff", fontWeight: "700", fontSize: 13, textAlign: "center" },
  matchHint: { color: Colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20, maxWidth: 240 },
  searchingContainer: { alignItems: "center", gap: 24 },
  searchPulse: {
    position: "absolute", width: 220, height: 220,
    borderRadius: 110, borderWidth: 2.5, borderColor: Colors.accent,
  },
  searchPulse2: {
    position: "absolute", width: 180, height: 180,
    borderRadius: 90, borderWidth: 1.5, borderColor: "rgba(232,70,124,0.4)",
  },
  searchOrb: { width: 120, height: 120, borderRadius: 60, overflow: "hidden" },
  searchOrbGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  searchingText: { color: Colors.textSecondary, fontWeight: "600", fontSize: 16 },
  cancelBtn: {
    paddingHorizontal: 28, paddingVertical: 12,
    borderRadius: 20, borderWidth: 1, borderColor: Colors.border,
  },
  cancelText: { color: Colors.textSecondary, fontWeight: "600", fontSize: 14 },
  matchedContainer: { alignItems: "center", gap: 12, width: "100%", paddingHorizontal: 24 },
  matchedGlow: {
    position: "absolute", width: 220, height: 220,
    borderRadius: 110, backgroundColor: "rgba(232,70,124,0.12)",
  },
  matchedGradBg: { position: "absolute", top: -120, left: 0, right: 0, height: 350 },
  matchedTitle: { fontSize: 28, fontWeight: "800", color: Colors.accent },
  matchedAvatar: { width: 110, height: 110, borderRadius: 55, overflow: "hidden" },
  matchedAvatarGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  matchedName: { fontSize: 24, fontWeight: "700", color: Colors.textPrimary },
  matchedSub: { fontSize: 14, color: Colors.textSecondary },
  matchedActions: { flexDirection: "row", gap: 20, marginTop: 12 },
  declineBtn: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(232,70,70,0.12)", borderWidth: 2, borderColor: Colors.danger,
  },
  acceptBtnWrap: { borderRadius: 34, overflow: "hidden" },
  acceptBtnGrad: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 28, paddingVertical: 20, borderRadius: 34,
  },
  acceptText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  infoSection: { padding: 20, paddingBottom: 120, gap: 10 },
  infoCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: Colors.backgroundCard, borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: Colors.border,
  },
  infoText: { flex: 1, gap: 4 },
  infoTitle: { fontSize: 14, fontWeight: "700", color: Colors.textPrimary },
  infoDesc: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  modalContainer: { flex: 1, backgroundColor: Colors.background, paddingTop: 60 },
  modalHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingBottom: 16, paddingTop: 10,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  modalTitle: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary },
  historyHint: {
    fontSize: 12, color: Colors.textMuted,
    paddingHorizontal: 20, paddingVertical: 12, lineHeight: 18,
  },
  emptyHistory: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyHistoryText: { color: Colors.textMuted, fontSize: 16 },
  historyItem: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
    overflow: "hidden",
  },
  historyAvatar: { width: 48, height: 48, borderRadius: 24, overflow: "hidden" },
  historyAvatarGrad: { flex: 1, alignItems: "center", justifyContent: "center" },
  historyInfo: { flex: 1, gap: 3 },
  historyName: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  historySub: { fontSize: 13, color: Colors.textSecondary },
  historyDate: { fontSize: 11, color: Colors.textMuted },
  unlockBtn: { borderRadius: 16, overflow: "hidden" },
  unlockBtnGrad: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
  },
  unlockBtnText: { color: "#fff", fontSize: 13, fontWeight: "800" },
});