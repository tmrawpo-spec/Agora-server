import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  FlatList,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Audio } from "expo-av";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  doc,
  getDoc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  addDoc,
  collection,
} from "firebase/firestore";
import { db } from "../../constants/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useData, Post } from "@/contexts/DataContext";
import { Colors } from "@/constants/colors";
import { Language } from "@/constants/i18n";
import BlockReportModal from "@/components/BlockReportModal";

const CALL_COST = 80;
const MSG_COST = 50;
const REVEAL_COST = 30;

function UserPostCard({ post }: { post: Post }) {
  return (
    <Pressable
      style={styles.userPostCard}
      onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.id } })}
    >
      <View style={styles.userPostMain}>
        <Text style={styles.userPostContent} numberOfLines={2}>
          {post.content}
        </Text>
        <View style={styles.userPostMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="heart" size={12} color={Colors.accent} />
            <Text style={styles.metaText}>{post.likes}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="chatbubble-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.metaText}>{post.comments.length}</Text>
          </View>
          <Text style={styles.metaDate}>
            {new Date(post.createdAt).toLocaleDateString()}
          </Text>
        </View>
      </View>
      {post.photo && (
        <Image
          source={{ uri: post.photo }}
          style={styles.userPostImage}
          contentFit="cover"
        />
      )}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; profileData: string }>();
  const { user, spendCoins } = useAuth();
  const { addConversation, conversations, posts } = useData();

  const [fullProfile, setFullProfile] = useState<any>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockReason, setBlockReason] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const lang = (user?.language || "ko") as Language;
  const isFemale = useMemo(() => user?.gender === "female", [user?.gender]);

  let initialProfile: any = null;
  try {
    if (params.profileData) initialProfile = JSON.parse(params.profileData);

    if (!initialProfile && params.id) {
      const foundPost = posts.find((p) => p.userId === params.id);
      if (foundPost) {
        initialProfile = {
          id: foundPost.userId,
          nickname: foundPost.nickname,
          profilePhoto: foundPost.profilePhoto,
          gender: foundPost.gender,
          age: "?",
          location: "Unknown",
        };
      }
    }
  } catch (e) {
    console.error("Profile parsing error", e);
  }

  useEffect(() => {
    async function fetchFullProfile() {
      const targetId = params.id || initialProfile?.id;
      if (!targetId) return;

      setIsFetching(true);
      try {
        const userRef = doc(db, "users", targetId);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          setFullProfile({ id: snap.id, ...snap.data() });
        }
      } catch (err) {
        console.error("❌ 최신 프로필 로드 실패:", err);
      } finally {
        setIsFetching(false);
      }
    }

    fetchFullProfile();
  }, [params.id, initialProfile?.id]);

  const profile = fullProfile || initialProfile;

  const userPosts = useMemo(() => {
    return posts
      .filter((p) => p.userId === (profile?.id || params.id))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [posts, profile, params.id]);

  const existingConvo = useMemo(() => {
    if (!profile?.id || !conversations || !user?.id) return null;

    const directConvoId = [user.id, profile.id].sort().join("_");

    return (
      conversations.find(
        (convo: any) =>
          convo.id === directConvoId || convo.matchedUser?.id === profile.id
      ) || null
    );
  }, [conversations, profile, user?.id]);

  const isExistingChat = Boolean(existingConvo);
  const isExistingFriend = existingConvo?.isFriend === true;
  const isFemaleToMaleFree =
    user?.gender === "female" && profile?.gender === "male";

  const [isUnlocked, setIsUnlocked] = useState(false);
  const UNLOCK_KEY = `@nighton_unlocked_${params.id}`;

  useEffect(() => {
    async function loadUnlockState() {
      if (isFemale) {
        setIsUnlocked(true);
        return;
      }

      if (isExistingChat) {
        setIsUnlocked(true);
        return;
      }

      try {
        const saved = await AsyncStorage.getItem(UNLOCK_KEY);
        if (saved === "true") setIsUnlocked(true);
      } catch (e) {
        console.log("unlock 상태 로드 실패:", e);
      }
    }

    loadUnlockState();
  }, [isExistingChat, isFemale]);

  const effectiveUnlocked = isFemale || isUnlocked;

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [sound]);

  if (!profile) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Profile not found</Text>
        </View>
      </View>
    );
  }

  async function handleUnlock() {
    if (isFemale) {
      setIsUnlocked(true);
      return;
    }

    const ok = await spendCoins(REVEAL_COST);
    if (!ok) {
      Alert.alert(
        lang === "ko" ? "Seeds 부족" : "Not Enough Seeds",
        lang === "ko"
          ? `🌻 ${REVEAL_COST} Seeds가 필요합니다.`
          : `You need 🌻 ${REVEAL_COST} Seeds.`
      );
      return;
    }

    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    try {
      await AsyncStorage.setItem(UNLOCK_KEY, "true");
    } catch (e) {}

    setIsUnlocked(true);
  }

  async function toggleVoice() {
    if (!effectiveUnlocked) {
      Alert.alert(
        lang === "ko" ? "잠김" : "Locked",
        lang === "ko"
          ? "먼저 프로필을 공개해주세요."
          : "Please unlock the profile first."
      );
      return;
    }

    if (!profile.voiceIntroUrl) return;

    try {
      if (sound) {
        const status = await sound.getStatusAsync();
        if (status.isLoaded) {
          if (isPlaying) {
            await sound.pauseAsync();
            setIsPlaying(false);
          } else {
            await sound.playAsync();
            setIsPlaying(true);
          }
        }
        return;
      }

      setIsLoadingAudio(true);

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: profile.voiceIntroUrl },
        { shouldPlay: true }
      );

      setSound(newSound);
      setIsPlaying(true);
      setIsLoadingAudio(false);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setIsPlaying(false);
          newSound.setPositionAsync(0);
        }
      });
    } catch (err) {
      setIsLoadingAudio(false);
    }
  }

  async function handleCall() {
    if (!effectiveUnlocked || !user?.id) return;

    const targetToken = profile?.fcmToken || profile?.TargetToken;
    if (!targetToken) {
      Alert.alert(
        lang === "ko" ? "연결 불가" : "Cannot Call",
        lang === "ko"
          ? "상대방의 푸시 정보를 불러올 수 없습니다."
          : "Cannot find recipient's push token."
      );
      return;
    }

    const shouldPay = !isExistingFriend && !isFemaleToMaleFree;

    if (shouldPay) {
      const ok = await spendCoins(CALL_COST);
      if (!ok) {
        Alert.alert(
          lang === "ko" ? "Seeds 부족" : "Not Enough Seeds",
          lang === "ko"
            ? `전화하려면 🌻 ${CALL_COST} Seeds가 필요합니다.`
            : `Need 🌻 ${CALL_COST} Seeds to call.`
        );
        return;
      }
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      setIsFetching(true);

      const convo = await addConversation(
        { ...profile, fcmToken: targetToken },
        shouldPay
          ? {
              messageUnlocked: true,
              voiceUnlocked: true,
              isFriend: true,
              friendSource: "paid",
              myUserId: user.id,
            }
          : isFemaleToMaleFree
          ? {
              messageUnlocked: true,
              voiceUnlocked: true,
              isFriend: true,
              friendSource: "female_free",
              myUserId: user.id,
            }
          : {
              messageUnlocked: true,
              voiceUnlocked: true,
              isFriend: true,
              myUserId: user.id,
            }
      );

      router.push({
        pathname: "/matching/calling",
        params: {
          convoId: convo.id,
          profileName: profile.nickname,
          targetToken,
          isAlreadyFriend: "true",
          isLookTab: "false",
          isReceiver: "false",
          callType: shouldPay ? "paid" : "friend",
        },
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetching(false);
    }
  }

  async function handleMessage() {
    if (!effectiveUnlocked || !user?.id) return;

    const shouldPay = !isExistingFriend && !isFemaleToMaleFree;

    if (shouldPay) {
      const ok = await spendCoins(MSG_COST);
      if (!ok) {
        Alert.alert(
          lang === "ko" ? "Seeds 부족" : "Not Enough Seeds",
          lang === "ko"
            ? `메시지 전송에 🌻 ${MSG_COST} Seeds가 필요합니다.`
            : `Need 🌻 ${MSG_COST} Seeds to message.`
        );
        return;
      }
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const convo = await addConversation(
      profile,
      shouldPay
        ? {
            messageUnlocked: true,
            isFriend: true,
            friendSource: "paid",
            myUserId: user.id,
          }
        : isFemaleToMaleFree
        ? {
            messageUnlocked: true,
            isFriend: true,
            friendSource: "female_free",
            myUserId: user.id,
          }
        : {
            messageUnlocked: true,
            isFriend: true,
            myUserId: user.id,
          }
    );

    router.push({ pathname: "/chat/[id]", params: { id: convo.id } });
  }

  async function handleBlock(withReport: boolean) {
    setShowBlockModal(false);

    if (user?.id && profile?.id) {
      try {
        await updateDoc(doc(db, "users", user.id), {
          blockedUsers: arrayUnion(profile.id),
          friends: arrayRemove(profile.id),
        });

        if (withReport && blockReason) {
          await addDoc(collection(db, "reports"), {
            reporterId: user.id,
            reportedId: profile.id,
            reason: blockReason,
            createdAt: Date.now(),
          });
        }
      } catch (e) {
        console.log("차단/신고 실패:", e);
      }
    }

    setBlockReason(null);
    router.back();
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>
          {effectiveUnlocked ? profile.nickname : "???"}
        </Text>
        <Pressable
          style={styles.blockHeaderBtn}
          onPress={() => setShowBlockModal(true)}
        >
          <Ionicons name="ban-outline" size={20} color={Colors.danger} />
        </Pressable>
      </View>

      <FlatList
        data={effectiveUnlocked ? userPosts : []}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={() => (
          <View style={styles.heroSection}>
            <View style={styles.avatarWrap}>
              {profile.profilePhoto ? (
                <Image source={{ uri: profile.profilePhoto }} style={styles.avatar} />
              ) : (
                <LinearGradient
                  colors={
                    profile.gender === "female"
                      ? [Colors.accent, "#c01f5d"]
                      : [Colors.blue, "#2255aa"]
                  }
                  style={styles.avatar}
                >
                  <Ionicons
                    name={profile.gender === "female" ? "female" : "male"}
                    size={60}
                    color="#fff"
                  />
                </LinearGradient>
              )}
              <View
                style={[
                  styles.onlineBadge,
                  {
                    backgroundColor: profile.isOnline
                      ? Colors.success
                      : Colors.textMuted,
                  },
                ]}
              />
            </View>

            <Text style={styles.name}>
              {effectiveUnlocked ? profile.nickname : "???"}
            </Text>
            <Text style={styles.sub}>
              {profile.age} 세 · {effectiveUnlocked ? profile.location : "???"}
            </Text>

            {profile.voiceIntroUrl && (
              <Pressable
                style={[styles.voiceBar, isPlaying && styles.voiceBarActive]}
                onPress={toggleVoice}
              >
                {isLoadingAudio ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <Ionicons
                    name={isPlaying ? "pause-circle" : "play-circle"}
                    size={32}
                    color={isPlaying ? "#fff" : Colors.accent}
                  />
                )}
                <Text style={[styles.voiceText, isPlaying && styles.voiceTextActive]}>
                  {effectiveUnlocked
                    ? isPlaying
                      ? "목소리 재생 중..."
                      : "목소리 소개 듣기"
                    : "잠김"}
                </Text>
              </Pressable>
            )}

            <View style={[styles.actions, !effectiveUnlocked && { opacity: 0.3 }]}>
              <Pressable style={styles.msgBtn} onPress={handleMessage}>
                <View style={styles.actionInner}>
                  <Ionicons name="chatbubble" size={22} color={Colors.teal} />
                  <Text style={[styles.actionText, { color: Colors.teal }]}>
                    메시지
                  </Text>
                  <View style={styles.costBadge}>
                    <Text style={[styles.costText, { color: Colors.teal }]}>
                      {isExistingFriend || isFemaleToMaleFree ? "FREE" : `🌻 ${MSG_COST}`}
                    </Text>
                  </View>
                </View>
              </Pressable>

              <Pressable style={styles.callBtnWrap} onPress={handleCall}>
                <LinearGradient
                  colors={[Colors.accent, "#c01f5d"]}
                  style={styles.callBtnGrad}
                >
                  <Ionicons name="call" size={22} color="#fff" />
                  <Text style={styles.callText}>음성통화</Text>
                  <View
                    style={[
                      styles.costBadge,
                      { backgroundColor: "rgba(255,255,255,0.2)" },
                    ]}
                  >
                    <Text style={[styles.costText, { color: "#fff" }]}>
                      {isExistingFriend || isFemaleToMaleFree ? "FREE" : `🌻 ${CALL_COST}`}
                    </Text>
                  </View>
                </LinearGradient>
              </Pressable>
            </View>

            {effectiveUnlocked && (
              <View style={styles.postDivider}>
                <Text style={styles.postDividerText}>
                  작성한 게시글 ({userPosts.length})
                </Text>
              </View>
            )}
          </View>
        )}
        renderItem={({ item }) => <UserPostCard post={item} />}
        ListEmptyComponent={() =>
          effectiveUnlocked ? (
            <View style={styles.emptyPosts}>
              <Text style={styles.emptyPostsText}>작성한 게시글이 없습니다.</Text>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {!effectiveUnlocked && (
        <BlurView intensity={95} style={StyleSheet.absoluteFill} tint="dark">
          <View style={styles.lockContainer}>
            <View style={styles.lockCircle}>
              <Ionicons name="lock-closed" size={40} color="#fff" />
            </View>
            <Text style={styles.lockTitle}>
              {lang === "ko" ? "프로필 잠금" : "Profile Locked"}
            </Text>
            <Text style={styles.lockSub}>
              {lang === "ko"
                ? `매칭된 친구의 정보를 더 보려면\n🌻 ${REVEAL_COST} Seeds가 필요합니다.`
                : `Profile is locked.\nUse 🌻 ${REVEAL_COST} Seeds to reveal.`}
            </Text>
            <Pressable style={styles.unlockBtn} onPress={handleUnlock}>
              <LinearGradient colors={[Colors.gold, "#b8860b"]} style={styles.unlockBtnGrad}>
                <Text style={styles.unlockBtnEmoji}>🌻</Text>
                <Text style={styles.unlockBtnText}>
                  {lang === "ko" ? "공개하기" : "Unlock"} ({REVEAL_COST} Seeds)
                </Text>
              </LinearGradient>
            </Pressable>
            <Pressable style={styles.closeBtn} onPress={() => router.back()}>
              <Text style={styles.closeBtnText}>뒤로가기</Text>
            </Pressable>
          </View>
        </BlurView>
      )}

      {isFetching && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      )}

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
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: Colors.textPrimary },
  blockHeaderBtn: { padding: 8 },
  heroSection: { alignItems: "center", paddingVertical: 32, gap: 8 },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderColor: Colors.border,
  },
  onlineBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: Colors.background,
  },
  name: {
    fontSize: 26,
    fontWeight: "800",
    color: Colors.textPrimary,
    marginTop: 8,
  },
  sub: { fontSize: 15, color: Colors.textSecondary },
  voiceBar: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.backgroundCard,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 10,
    marginTop: 10,
  },
  voiceBarActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  voiceText: { fontSize: 14, fontWeight: "700", color: Colors.textPrimary },
  voiceTextActive: { color: "#fff" },
  actions: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    marginTop: 20,
    width: "100%",
  },
  msgBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(61,217,197,0.4)",
    backgroundColor: "rgba(61,217,197,0.08)",
  },
  actionInner: { alignItems: "center", paddingVertical: 14, gap: 2 },
  actionText: { fontWeight: "700", fontSize: 14 },
  callBtnWrap: { flex: 1, borderRadius: 14, overflow: "hidden" },
  callBtnGrad: { alignItems: "center", paddingVertical: 14, gap: 2 },
  callText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  costBadge: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  costText: { fontSize: 11, fontWeight: "800" },
  postDivider: {
    width: "100%",
    paddingHorizontal: 20,
    paddingTop: 30,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    alignItems: "flex-start",
  },
  postDividerText: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  userPostCard: {
    flexDirection: "row",
    backgroundColor: Colors.backgroundCard,
    marginHorizontal: 20,
    marginTop: 12,
    padding: 15,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 12,
  },
  userPostMain: { flex: 1, justifyContent: "space-between" },
  userPostContent: { fontSize: 15, color: Colors.textPrimary, lineHeight: 20 },
  userPostMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 10,
  },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  metaDate: { fontSize: 11, color: Colors.textMuted, marginLeft: "auto" },
  userPostImage: { width: 60, height: 60, borderRadius: 10 },
  emptyPosts: { alignItems: "center", padding: 40 },
  emptyPostsText: { color: Colors.textMuted, fontSize: 14 },
  lockContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
  },
  lockCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  lockTitle: { fontSize: 24, fontWeight: "800", color: "#fff", marginBottom: 10 },
  lockSub: {
    fontSize: 16,
    color: "rgba(255,255,255,0.7)",
    textAlign: "center",
    marginBottom: 30,
  },
  unlockBtn: { width: "100%", borderRadius: 30, overflow: "hidden" },
  unlockBtnGrad: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 8,
  },
  unlockBtnEmoji: { fontSize: 18 },
  unlockBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  closeBtn: { marginTop: 20, padding: 10 },
  closeBtnText: { color: "rgba(255,255,255,0.5)", fontSize: 14 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.textMuted, fontSize: 16 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.3)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 999,
  },
});
