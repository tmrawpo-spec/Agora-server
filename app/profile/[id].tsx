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
import { doc, getDoc } from "firebase/firestore"; // ✅ Firestore 직조회를 위해 추가
import { db } from "../../constants/firebase"; // ✅ DB 인스턴스 추가
import { useAuth } from "@/contexts/AuthContext";
import { useData, Post } from "@/contexts/DataContext";
import { Colors } from "@/constants/colors";
import { t, Language } from "@/constants/i18n";

const CALL_COST = 20;
const MSG_COST = 5;
const REVEAL_COST = 10; 

function UserPostCard({ post }: { post: Post }) {
  return (
    <Pressable 
      style={styles.userPostCard} 
      onPress={() => router.push({ pathname: "/post/[id]", params: { id: post.id } })}
    >
      <View style={styles.userPostMain}>
        <Text style={styles.userPostContent} numberOfLines={2}>{post.content}</Text>
        <View style={styles.userPostMeta}>
          <View style={styles.metaItem}>
            <Ionicons name="heart" size={12} color={Colors.accent} />
            <Text style={styles.metaText}>{post.likes}</Text>
          </View>
          <View style={styles.metaItem}>
            <Ionicons name="chatbubble-outline" size={12} color={Colors.textMuted} />
            <Text style={styles.metaText}>{post.comments.length}</Text>
          </View>
          <Text style={styles.metaDate}>{new Date(post.createdAt).toLocaleDateString()}</Text>
        </View>
      </View>
      {post.photo && (
        <Image source={{ uri: post.photo }} style={styles.userPostImage} contentFit="cover" />
      )}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; profileData: string }>();
  const { user, spendCoins } = useAuth();
  const { addConversation, conversations, posts } = useData();

  const [fullProfile, setFullProfile] = useState<any>(null); // ✅ 최신 DB 데이터를 저장할 상태
  const [isFetching, setIsFetching] = useState(false); // ✅ 로딩 상태

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const lang = (user?.language || "ko") as Language;

  const isFemale = useMemo(() => user?.gender === "female", [user?.gender]);

  // 초기 profile 파싱 (전달받은 데이터)
  let initialProfile: any = null;
  try {
    if (params.profileData) initialProfile = JSON.parse(params.profileData);
    if (!initialProfile && params.id) {
      const foundPost = posts.find(p => p.userId === params.id);
      if (foundPost) {
        initialProfile = {
          id: foundPost.userId,
          nickname: foundPost.nickname,
          profilePhoto: foundPost.profilePhoto,
          gender: foundPost.gender,
          age: "?",
          location: "Unknown"
        };
      }
    }
  } catch (e) {
    console.error("Profile parsing error", e);
  }

  // ✅ [핵심 수정] 화면 진입 시 해당 유저의 최신 데이터를 DB에서 직접 가져옴
  useEffect(() => {
    async function fetchFullProfile() {
      const targetId = params.id || initialProfile?.id;
      if (!targetId) return;

      setIsFetching(true);
      try {
        const userRef = doc(db, "users", targetId);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
          const data = snap.data();
          console.log("📡 [Profile] 최신 데이터 로드 완료 (FCM 토큰 유무):", !!data.fcmToken);
          setFullProfile({ id: snap.id, ...data });
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
    return posts.filter((p) => p.userId === (profile?.id || params.id))
                .sort((a, b) => b.createdAt - a.createdAt);
  }, [posts, profile, params.id]);

  const isExistingChat = useMemo(() => {
    if (!profile?.id || !conversations) return false;
    return conversations.some((convo: any) => convo.matchedUser?.id === profile.id);
  }, [conversations, profile]);

  const [isUnlocked, setIsUnlocked] = useState(true);

  useEffect(() => {
    if (isFemale) {
      setIsUnlocked(true);
    } else {
      setIsUnlocked(isExistingChat);
    }
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
      Alert.alert(t(lang, "coins_required"), lang === "ko" ? `${REVEAL_COST} 코인이 필요합니다.` : `You need ${REVEAL_COST} coins.`);
      return;
    }
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setIsUnlocked(true);
  }

  async function toggleVoice() {
    if (!effectiveUnlocked) {
      Alert.alert(lang === "ko" ? "잠김" : "Locked", lang === "ko" ? "먼저 프로필을 공개해주세요." : "Please unlock the profile first.");
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
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: profile.voiceIntroUrl }, { shouldPlay: true });
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

  // ✅ [수정된 handleCall] 이제 targetToken을 확실히 확보하여 전달합니다.
  async function handleCall() {
    if (!effectiveUnlocked) return;
    
    // ✅ [수정] fcmToken과 TargetToken 둘 다 확인합니다.
    const targetToken = profile?.fcmToken || profile?.TargetToken;

    console.log("📡 [handleCall] 추출된 토큰:", targetToken); // 테스트용 로그 추가

    if (!targetToken) {
      Alert.alert(
        lang === "ko" ? "연결 불가" : "Cannot Call", 
        lang === "ko" ? "상대방의 푸시 정보를 불러올 수 없습니다. 다시 시도해주세요." : "Cannot find recipient's push token."
      );
      return;
    }

    // 2. 코인 차감 로직
    if (!isFemale && !isExistingChat) {
      const ok = await spendCoins(CALL_COST);
      if (!ok) {
        Alert.alert(t(lang, "coins_required"), lang === "ko" ? `전화하려면 ${CALL_COST} 코인이 필요합니다.` : `Need ${CALL_COST} coins to call.`);
        return;
      }
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    
    // 3. 대화방 생성 및 이동
    try {
      setIsFetching(true);
      // addConversation 시에도 토큰이 포함된 최신 profile을 넘깁니다.
      const convo = await addConversation({ ...profile, fcmToken: targetToken }); 
      
      router.push({ 
        pathname: "/matching/calling", 
        params: { 
          convoId: convo.id, 
          profileName: profile.nickname,
          targetToken: targetToken, // ✅ 이제 여기서 undefined가 아닌 실제 값이 넘어갑니다.
          isAlreadyFriend: "true", 
          isLookTab: "false",
          isReceiver: "false"
        } 
      });
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetching(false);
    }
  }

  async function handleMessage() {
    if (!effectiveUnlocked) return;
    if (!isFemale && !isExistingChat) {
      const ok = await spendCoins(MSG_COST);
      if (!ok) {
        Alert.alert(t(lang, "coins_required"), lang === "ko" ? `메시지 전송에 ${MSG_COST} 코인이 필요합니다.` : `Need ${MSG_COST} coins to message.`);
        return;
      }
    }
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const convo = await addConversation(profile);
    router.push({ pathname: "/chat/[id]", params: { id: convo.id } });
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>{effectiveUnlocked ? profile.nickname : "???"}</Text>
        <View style={styles.headerCoins}>
          <Ionicons name="star" size={14} color={Colors.gold} />
          <Text style={styles.headerCoinsText}>{user?.coins ?? 0}</Text>
        </View>
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
                  colors={profile.gender === "female" ? [Colors.accent, "#c01f5d"] : [Colors.blue, "#2255aa"]}
                  style={styles.avatar}
                >
                  <Ionicons name={profile.gender === "female" ? "female" : "male"} size={60} color="#fff" />
                </LinearGradient>
              )}
              <View style={[styles.onlineBadge, { backgroundColor: profile.isOnline ? Colors.success : Colors.textMuted }]} />
            </View>

            <Text style={styles.name}>{effectiveUnlocked ? profile.nickname : "???"}</Text>
            <Text style={styles.sub}>{profile.age} 세 · {effectiveUnlocked ? profile.location : "???"}</Text>

            {profile.voiceIntroUrl && (
              <Pressable style={[styles.voiceBar, isPlaying && styles.voiceBarActive]} onPress={toggleVoice}>
                {isLoadingAudio ? (
                  <ActivityIndicator size="small" color={Colors.accent} />
                ) : (
                  <Ionicons name={isPlaying ? "pause-circle" : "play-circle"} size={32} color={isPlaying ? "#fff" : Colors.accent} />
                )}
                <Text style={[styles.voiceText, isPlaying && styles.voiceTextActive]}>
                  {effectiveUnlocked ? (isPlaying ? "목소리 재생 중..." : "목소리 소개 듣기") : "잠김"}
                </Text>
              </Pressable>
            )}

            <View style={[styles.actions, !effectiveUnlocked && { opacity: 0.3 }]}>
              <Pressable style={styles.msgBtn} onPress={handleMessage}>
                <View style={styles.actionInner}>
                  <Ionicons name="chatbubble" size={22} color={Colors.teal} />
                  <Text style={[styles.actionText, { color: Colors.teal }]}>메시지</Text>
                  <View style={styles.costBadge}>
                    <Ionicons name="star" size={10} color={Colors.teal} />
                    <Text style={[styles.costText, { color: Colors.teal }]}>
                      {isFemale || isExistingChat ? "FREE" : MSG_COST}
                    </Text>
                  </View>
                </View>
              </Pressable>

              <Pressable style={styles.callBtnWrap} onPress={handleCall}>
                <LinearGradient colors={[Colors.accent, "#c01f5d"]} style={styles.callBtnGrad}>
                  <Ionicons name="call" size={22} color="#fff" />
                  <Text style={styles.callText}>음성통화</Text>
                  <View style={[styles.costBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                    <Ionicons name="star" size={10} color="#fff" />
                    <Text style={[styles.costText, { color: "#fff" }]}>
                      {isFemale || isExistingChat ? "FREE" : CALL_COST}
                    </Text>
                  </View>
                </LinearGradient>
              </Pressable>
            </View>

            {effectiveUnlocked && (
              <View style={styles.postDivider}>
                <Text style={styles.postDividerText}>작성한 게시글 ({userPosts.length})</Text>
              </View>
            )}
          </View>
        )}
        renderItem={({ item }) => <UserPostCard post={item} />}
        ListEmptyComponent={() => (
          effectiveUnlocked ? (
            <View style={styles.emptyPosts}>
              <Text style={styles.emptyPostsText}>작성한 게시글이 없습니다.</Text>
            </View>
          ) : null
        )}
        contentContainerStyle={{ paddingBottom: 100 }}
      />

      {!effectiveUnlocked && (
        <BlurView intensity={95} style={StyleSheet.absoluteFill} tint="dark">
          <View style={styles.lockContainer}>
            <View style={styles.lockCircle}><Ionicons name="lock-closed" size={40} color="#fff" /></View>
            <Text style={styles.lockTitle}>{lang === "ko" ? "프로필 잠금" : "Profile Locked"}</Text>
            <Text style={styles.lockSub}>{lang === "ko" ? `매칭된 친구의 정보를 더 보려면\n${REVEAL_COST} 코인이 필요합니다.` : `Matched friend's profile is locked.\nUse ${REVEAL_COST} coins to reveal.`}</Text>
            <Pressable style={styles.unlockBtn} onPress={handleUnlock}>
              <LinearGradient colors={[Colors.gold, "#b8860b"]} style={styles.unlockBtnGrad}>
                <Ionicons name="star" size={18} color="#fff" /><Text style={styles.unlockBtnText}>{lang === "ko" ? "공개하기" : "Unlock"} ({REVEAL_COST} Coins)</Text>
              </LinearGradient>
            </Pressable>
            <Pressable style={styles.closeBtn} onPress={() => router.back()}><Text style={styles.closeBtnText}>뒤로가기</Text></Pressable>
          </View>
        </BlurView>
      )}

      {isFetching && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={Colors.accent} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 8 },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 17, fontWeight: "700", color: Colors.textPrimary },
  headerCoins: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.backgroundCard, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  headerCoinsText: { fontSize: 13, fontWeight: "700", color: Colors.gold },
  heroSection: { alignItems: "center", paddingVertical: 32, gap: 8 },
  avatarWrap: { position: "relative" },
  avatar: { width: 120, height: 120, borderRadius: 60, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: Colors.border },
  onlineBadge: { position: "absolute", bottom: 6, right: 6, width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: Colors.background },
  name: { fontSize: 26, fontWeight: "800", color: Colors.textPrimary, marginTop: 8 },
  sub: { fontSize: 15, color: Colors.textSecondary },
  voiceBar: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.backgroundCard, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 25, borderWidth: 1, borderColor: Colors.border, gap: 10, marginTop: 10 },
  voiceBarActive: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  voiceText: { fontSize: 14, fontWeight: "700", color: Colors.textPrimary },
  voiceTextActive: { color: "#fff" },
  actions: { flexDirection: "row", gap: 12, paddingHorizontal: 20, marginTop: 20, width: '100%' },
  msgBtn: { flex: 1, borderRadius: 14, borderWidth: 1, borderColor: "rgba(61,217,197,0.4)", backgroundColor: "rgba(61,217,197,0.08)" },
  actionInner: { alignItems: "center", paddingVertical: 14, gap: 2 },
  actionText: { fontWeight: "700", fontSize: 14 },
  callBtnWrap: { flex: 1, borderRadius: 14, overflow: "hidden" },
  callBtnGrad: { alignItems: "center", paddingVertical: 14, gap: 2 },
  callText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  costBadge: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  costText: { fontSize: 11, fontWeight: "800" },
  postDivider: { width: '100%', paddingHorizontal: 20, paddingTop: 30, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border, alignItems: 'flex-start' },
  postDividerText: { fontSize: 16, fontWeight: '700', color: Colors.textPrimary },
  userPostCard: { flexDirection: "row", backgroundColor: Colors.backgroundCard, marginHorizontal: 20, marginTop: 12, padding: 15, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, gap: 12 },
  userPostMain: { flex: 1, justifyContent: "space-between" },
  userPostContent: { fontSize: 15, color: Colors.textPrimary, lineHeight: 20 },
  userPostMeta: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  metaText: { fontSize: 12, color: Colors.textMuted, fontWeight: "600" },
  metaDate: { fontSize: 11, color: Colors.textMuted, marginLeft: "auto" },
  userPostImage: { width: 60, height: 60, borderRadius: 10 },
  emptyPosts: { alignItems: "center", padding: 40 },
  emptyPostsText: { color: Colors.textMuted, fontSize: 14 },
  lockContainer: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  lockCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: "rgba(255,255,255,0.2)", alignItems: "center", justifyContent: "center", marginBottom: 20 },
  lockTitle: { fontSize: 24, fontWeight: "800", color: "#fff", marginBottom: 10 },
  lockSub: { fontSize: 16, color: "rgba(255,255,255,0.7)", textAlign: "center", marginBottom: 30 },
  unlockBtn: { width: "100%", borderRadius: 30, overflow: "hidden" },
  unlockBtnGrad: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 16, gap: 8 },
  unlockBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  closeBtn: { marginTop: 20, padding: 10 },
  closeBtnText: { color: "rgba(255,255,255,0.5)", fontSize: 14 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.textMuted, fontSize: 16 },
  loadingOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
});