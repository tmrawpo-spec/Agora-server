import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Platform,
  KeyboardAvoidingView,
  Modal,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av";
import { useAuth } from "@/contexts/AuthContext";
import { useData, PostComment } from "@/contexts/DataContext";
import { Colors } from "@/constants/colors";
import { t } from "@/constants/i18n";

function TimeAgo({ ts }: { ts: number }) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  let label = "just now";
  if (m > 0 && m < 60) label = `${m}m ago`;
  else if (h >= 1) label = `${h}h ago`;
  return <Text style={styles.timeAgo}>{label}</Text>;
}

export default function PostDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { posts, addComment, likePost, refreshPosts } = useData();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;
  const lang = user?.language || "en";

  const [commentText, setCommentText] = useState("");
  const [sending, setSending] = useState(false);

  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFullImage, setIsFullImage] = useState(false);

  useEffect(() => {
    refreshPosts();
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  const post = posts.find((p) => p.id === id);

  // ✅ 프로필 이동 공통 함수
  const handleProfilePress = (userId: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push({
      pathname: "/profile/[id]",
      params: { id: userId }
    });
  };

  async function playVoice() {
    if (!post?.voiceUrl) return;
    try {
      if (sound && isPlaying) {
        await sound.pauseAsync();
        setIsPlaying(false);
      } else if (sound) {
        await sound.playAsync();
        setIsPlaying(true);
      } else {
        const { sound: newSound } = await Audio.Sound.createAsync(
          { uri: post.voiceUrl },
          { shouldPlay: true }
        );
        setSound(newSound);
        setIsPlaying(true);
        newSound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) setIsPlaying(false);
        });
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleComment() {
    if (!commentText.trim() || !user || !id) return;
    setSending(true);
    try {
      await addComment(id, {
        userId: user.id,
        nickname: user.nickname,
        profilePhoto: user.profilePhoto,
        text: commentText.trim(),
      });
      if (Platform.OS !== 'web') {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      setCommentText("");
      await refreshPosts();
    } finally {
      setSending(false);
    }
  }

  if (!post) {
    return (
      <View style={[styles.container, { paddingTop: topPad }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Post not found</Text>
        </View>
      </View>
    );
  }

  const listData: any[] = [
    { type: "post", data: post },
    ...post.comments.map((c) => ({ type: "comment", data: c })),
  ];

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Post</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <FlatList
          data={listData}
          keyExtractor={(item, i) => (item.type === "post" ? `post-${item.data.id}` : `comment-${item.data.id || i}`)}
          renderItem={({ item }) => {
            if (item.type === "post") {
              const p = item.data;
              return (
                <View style={styles.postBody}>
                  <View style={styles.postHeader}>
                    {/* ✅ 게시글 작성자 프로필 사진 클릭 */}
                    <Pressable onPress={() => handleProfilePress(p.userId)} style={styles.postAvatar}>
                      {p.profilePhoto ? (
                        <Image source={{ uri: p.profilePhoto }} style={styles.postAvatarImg} />
                      ) : (
                        <LinearGradient
                          colors={p.gender === "female" ? [Colors.accent, "#c01f5d"] : [Colors.blue, "#2255aa"]}
                          style={styles.postAvatarImg}
                        >
                          <Ionicons name={p.gender === "female" ? "female" : "male"} size={16} color="#fff" />
                        </LinearGradient>
                      )}
                    </Pressable>
                    <View>
                      {/* ✅ 게시글 작성자 닉네임 클릭 */}
                      <Pressable onPress={() => handleProfilePress(p.userId)}>
                        <Text style={styles.postAuthor}>{p.nickname}</Text>
                      </Pressable>
                      <TimeAgo ts={p.createdAt} />
                    </View>
                  </View>

                  <Text style={styles.postContent}>{p.content}</Text>

                  {p.voiceUrl ? (
                    <Pressable style={styles.voicePlayer} onPress={playVoice}>
                      <Ionicons name={isPlaying ? "pause-circle" : "play-circle"} size={32} color="#fff" />
                      <Text style={styles.voiceText}>{isPlaying ? "Playing..." : "Listen to voice"}</Text>
                    </Pressable>
                  ) : null}

                  {p.photo ? (
                    <Pressable onPress={() => setIsFullImage(true)}>
                      <Image source={{ uri: p.photo }} style={styles.postImage} contentFit="cover" />
                    </Pressable>
                  ) : null}

                  <Pressable style={styles.likeRow} onPress={() => likePost(p.id, user?.id || "")}>
                    <Ionicons name="heart" size={18} color={Colors.accent} />
                    <Text style={styles.likeCount}>{p.likes || 0}</Text>
                  </Pressable>

                  <View style={styles.divider} />
                  <Text style={styles.commentsLabel}>
                    {t(lang, "comments")} ({p.comments?.length || 0})
                  </Text>
                </View>
              );
            } else {
              const c: PostComment = item.data;
              return (
                <View style={styles.commentItem}>
                  {/* ✅ 댓글 작성자 프로필 사진 클릭 */}
                  <Pressable onPress={() => handleProfilePress(c.userId)} style={styles.commentAvatar}>
                    {c.profilePhoto ? (
                      <Image source={{ uri: c.profilePhoto }} style={styles.commentAvatarImg} />
                    ) : (
                      <LinearGradient colors={[Colors.backgroundCard, Colors.border]} style={styles.commentAvatarImg}>
                        <Ionicons name="person" size={14} color={Colors.textMuted} />
                      </LinearGradient>
                    )}
                  </Pressable>
                  <View style={styles.commentContent}>
                    {/* ✅ 댓글 작성자 닉네임 클릭 */}
                    <Pressable onPress={() => handleProfilePress(c.userId)}>
                      <Text style={styles.commentAuthor}>{c.nickname}</Text>
                    </Pressable>
                    <Text style={styles.commentText}>{c.text}</Text>
                    <TimeAgo ts={c.createdAt} />
                  </View>
                </View>
              );
            }
          }}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />

        <View style={[styles.inputBar, { paddingBottom: botPad + 8 }]}>
          <TextInput
            style={styles.input}
            value={commentText}
            onChangeText={setCommentText}
            placeholder="Add a comment..."
            placeholderTextColor={Colors.textMuted}
            maxLength={300}
          />
          <Pressable
            onPress={handleComment}
            disabled={!commentText.trim() || sending}
            style={({ pressed }) => [
              styles.sendBtn,
              { opacity: commentText.trim() ? (pressed ? 0.7 : 1) : 0.4 },
            ]}
          >
            <LinearGradient colors={[Colors.accent, "#c01f5d"]} style={styles.sendBtnGrad}>
              <Ionicons name="send" size={16} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={isFullImage} transparent={true} animationType="fade">
        <View style={styles.fullScreenOverlay}>
          <Pressable style={styles.closeBtn} onPress={() => setIsFullImage(false)}>
            <Ionicons name="close" size={30} color="#fff" />
          </Pressable>
          {post.photo && <Image source={{ uri: post.photo }} style={styles.fullImage} contentFit="contain" />}
        </View>
      </Modal>
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
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { padding: 8 },
  headerTitle: { fontSize: 17, color: Colors.textPrimary, fontWeight: "700" },
  list: { paddingBottom: 20 },
  postBody: { padding: 20, gap: 14 },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  postAvatar: { width: 44, height: 44, borderRadius: 22, overflow: "hidden" },
  postAvatarImg: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  postAuthor: { fontSize: 15, color: Colors.textPrimary, fontWeight: "700" },
  timeAgo: { fontSize: 12, color: Colors.textMuted },
  postContent: { fontSize: 16, color: Colors.textPrimary, lineHeight: 24 },
  postImage: { width: "100%", height: 220, borderRadius: 14, marginTop: 5 },
  voicePlayer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.accent,
    padding: 10,
    borderRadius: 12,
    gap: 10,
    marginVertical: 5,
  },
  voiceText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  likeRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  likeCount: { fontSize: 14, color: Colors.accent, fontWeight: "600" },
  divider: { height: 1, backgroundColor: Colors.border },
  commentsLabel: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  commentItem: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  commentAvatar: { width: 36, height: 36, borderRadius: 18, overflow: "hidden" },
  commentAvatarImg: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  commentContent: { flex: 1, gap: 4 },
  commentAuthor: { fontSize: 14, color: Colors.textPrimary, fontWeight: "700" },
  commentText: { fontSize: 14, color: Colors.textPrimary, lineHeight: 20 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: Colors.textMuted, fontSize: 16 },
  inputBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
  },
  input: {
    flex: 1,
    backgroundColor: Colors.inputBackground,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: Colors.textPrimary,
    fontSize: 14,
  },
  sendBtn: { borderRadius: 18, overflow: "hidden" },
  sendBtnGrad: { width: 40, height: 40, alignItems: "center", justifyContent: "center", borderRadius: 20 },
  fullScreenOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.95)", justifyContent: "center", alignItems: "center" },
  fullImage: { width: "100%", height: "80%" },
  closeBtn: { position: "absolute", top: 50, right: 20, zIndex: 10, padding: 10 },
});