import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  Alert,
  Platform,
  Modal,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Audio } from "expo-av"; 
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/contexts/AuthContext";
import { useData, Post } from "@/contexts/DataContext";
import { Colors } from "@/constants/colors";
import { Language, t } from "@/constants/i18n";

// --- 컴포넌트 ---

function TimeAgo({ ts, lang }: { ts: number; lang: Language }) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(diff / 86400000);

  let label = "just now";
  if (lang === "ko") {
    if (m > 0 && m < 60) label = `${m}분 전`;
    else if (h > 0 && h < 24) label = `${h}시간 전`;
    else if (d > 0) label = `${d}일 전`;
    else label = "방금 전";
  } else if (lang === "zh") {
    if (m > 0 && m < 60) label = `${m}分钟前`;
    else if (h > 0 && h < 24) label = `${h}小时前`;
    else if (d > 0) label = `${d}天前`;
    else label = "刚刚";
  } else {
    if (m > 0 && m < 60) label = `${m}m ago`;
    else if (h > 0 && h < 24) label = `${h}h ago`;
    else if (d > 0) label = `${d}d ago`;
  }

  return <Text style={styles.timeAgo}>{label}</Text>;
}

function PostCard({ post, onPress, onLike, onImagePress, lang }: { post: Post; onPress: () => void; onLike: () => void; onImagePress: (uri: string) => void; lang: Language }) {

  // ✅ 프로필 이동 핸들러 추가
  const handleProfilePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({
      pathname: "/profile/[id]",
      params: { id: post.userId, profileData: JSON.stringify(post) }
    });
  };

  return (
    <Pressable style={styles.postCard} onPress={onPress}>
      {post.isPopular && (
        <View style={styles.popularBadge}>
          <Ionicons name="flame" size={12} color="#fff" />
          <Text style={styles.popularBadgeText}>HOT</Text>
        </View>
      )}

      <View style={styles.postHeader}>
        {/* ✅ 프로필 사진 클릭 시 이동 */}
        <Pressable onPress={handleProfilePress} style={styles.postAvatar}>
          {post.profilePhoto ? (
            <Image source={{ uri: post.profilePhoto }} style={styles.postAvatarImg} />
          ) : (
            <LinearGradient colors={post.gender === "female" ? [Colors.accent, "#c01f5d"] : [Colors.blue, "#2255aa"]} style={styles.postAvatarImg}>
              <Ionicons name={post.gender === "female" ? "female" : "male"} size={16} color="#fff" />
            </LinearGradient>
          )}
        </Pressable>

        <View style={styles.postAuthorInfo}>
          {/* ✅ 닉네임 클릭 시 이동 */}
          <Pressable onPress={handleProfilePress}>
            <Text style={styles.postAuthor}>{post.nickname}</Text>
          </Pressable>
          <TimeAgo ts={post.createdAt} lang={lang} />
        </View>
      </View>

      <Text style={styles.postContent} numberOfLines={3}>{post.content}</Text>

      {post.voiceUrl && (
        <View style={styles.voiceIndicator}>
          <Ionicons name="mic" size={14} color={Colors.accent} />
          <Text style={styles.voiceIndicatorText}>{t(lang, "voice_intro")}</Text>
        </View>
      )}

      {post.photo && (
        <Pressable onPress={() => onImagePress(post.photo!)}>
            <Image 
            source={{ uri: post.photo }} 
            style={styles.postImage} 
            contentFit="cover" 
            transition={200}
            />
        </Pressable>
      )}

      <View style={styles.postFooter}>
        <Pressable style={styles.likeBtn} onPress={onLike}>
          <Ionicons name="heart" size={16} color={Colors.accent} />
          <Text style={styles.likeCnt}>{post.likes}</Text>
        </Pressable>
        <View style={styles.commentBtn}>
          <Ionicons name="chatbubble-outline" size={16} color={Colors.textSecondary} />
          <Text style={styles.commentCnt}>{post.comments.length}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function BoardScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const lang = (user?.language || "en") as Language;
  const { posts, addPost, likePost, refreshPosts } = useData();

  const [boardTab, setBoardTab] = useState<"popular" | "latest">("popular");
  const [showCompose, setShowCompose] = useState(false);
  const [content, setContent] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const [voiceUri, setVoiceUri] = useState<string | undefined>();
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [posting, setPosting] = useState(false);

  const [previewSound, setPreviewSound] = useState<Audio.Sound | null>(null);
  const [isPlayingPreview, setIsPlayingPreview] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  async function togglePreview() {
    if (!voiceUri) return;
    try {
      if (previewSound && isPlayingPreview) {
        await previewSound.stopAsync();
        setIsPlayingPreview(false);
      } else {
        const { sound } = await Audio.Sound.createAsync({ uri: voiceUri });
        setPreviewSound(sound);
        setIsPlayingPreview(true);
        await sound.playAsync();
        sound.setOnPlaybackStatusUpdate((status) => {
          if (status.isLoaded && status.didJustFinish) setIsPlayingPreview(false);
        });
      }
    } catch (e) { Alert.alert("Error", lang === "ko" ? "재생 실패" : "Playback failed"); }
  }

  async function startRecording() {
    try {
      const permission = await Audio.requestPermissionsAsync();
      if (permission.status !== 'granted') return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: newRecording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      setRecording(newRecording);
      setIsRecording(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (e) { console.error(e); }
  }

  async function stopRecording() {
    if (!recording) return;
    setIsRecording(false);
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      setVoiceUri(recording.getURI() || undefined);
      setRecording(null);
    } catch (e) { console.error(e); }
  }

  async function pickPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.5,
    });
    if (!result.canceled) {
        setPhoto(result.assets[0].uri);
    }
  }

  async function handlePost() {
    if (!content.trim() && !voiceUri && !photo) return;
    setPosting(true);
    try {
      await addPost({
        userId: user!.id,
        nickname: user!.nickname,
        profilePhoto: user?.profilePhoto,
        gender: user!.gender,
        language: user!.language,
        content: content.trim(),
        photo,
        voiceUrl: voiceUri,
      });
      setShowCompose(false);
      setContent(""); setPhoto(undefined); setVoiceUri(undefined);
    } finally { setPosting(false); }
  }

  useEffect(() => {
    return () => {
      if (previewSound) previewSound.unloadAsync();
    };
  }, [previewSound]);

  const sorted = boardTab === "popular"
  ? [...posts]
      .filter(p => p.likes >= 5 || p.isPopular)
      .sort((a, b) => b.likes - a.likes)
  : [...posts].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <View style={[styles.container, { paddingTop: Platform.OS === "web" ? 67 : insets.top }]}> 
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t(lang, "board")}</Text>
        <Pressable style={styles.composeBtn} onPress={() => setShowCompose(true)}>
          <LinearGradient colors={[Colors.accent, "#c01f5d"]} style={styles.composeBtnGrad}>
            <Ionicons name="create-outline" size={18} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>

      <View style={styles.tabPills}>
        <Pressable style={[styles.pill, boardTab === "popular" && styles.pillActive]} onPress={() => setBoardTab("popular")}>
          {boardTab === "popular" && <LinearGradient colors={[Colors.accent, "#c01f5d"]} style={StyleSheet.absoluteFill} />}
          <Ionicons name="flame" size={14} color={boardTab === "popular" ? "#fff" : Colors.textMuted} />
          <Text style={[styles.pillText, boardTab === "popular" && styles.pillTextActive]}>
            {lang === "ko" ? "인기" : lang === "zh" ? "热门" : "Popular"}
          </Text>
        </Pressable>
        <Pressable style={[styles.pill, boardTab === "latest" && styles.pillActive]} onPress={() => setBoardTab("latest")}>
          {boardTab === "latest" && <LinearGradient colors={[Colors.accent, "#c01f5d"]} style={StyleSheet.absoluteFill} />}
          <Ionicons name="time" size={14} color={boardTab === "latest" ? "#fff" : Colors.textMuted} />
          <Text style={[styles.pillText, boardTab === "latest" && styles.pillTextActive]}>
            {lang === "ko" ? "최신" : lang === "zh" ? "最新" : "Latest"}
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={sorted}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PostCard
            post={item}
            lang={lang}
            onPress={() => router.push({ pathname: "/post/[id]", params: { id: item.id } })}
            onLike={() => likePost(item.id, user!.id)}
            onImagePress={(uri) => setSelectedImage(uri)}
          />
        )}
        contentContainerStyle={styles.list}
        onRefresh={refreshPosts}
        refreshing={false}
      />

      {/* 게시글 작성 모달 */}
      <Modal visible={showCompose} animationType="slide" presentationStyle="fullScreen">
        <View style={[styles.compose, { paddingTop: insets.top }]}>
          <View style={styles.composeHeader}>
            <Pressable onPress={() => setShowCompose(false)}>
              <Text style={styles.composeCancel}>{t(lang, "cancel")}</Text>
            </Pressable>
            <Text style={styles.composeTitle}>{lang === "ko" ? "새 게시글" : lang === "zh" ? "新帖子" : "New Post"}</Text>
            <Pressable onPress={handlePost} disabled={posting}>
              <Text style={styles.composePost}>{posting ? "..." : t(lang, "post")}</Text>
            </Pressable>
          </View>

          <View style={styles.topToolbar}>
             <View style={styles.toolbarLeft}>
                <Pressable style={styles.toolBtn} onPress={pickPhoto}>
                    <Ionicons name="image" size={24} color={photo ? Colors.accent : Colors.textPrimary} />
                </Pressable>
                <Pressable style={styles.toolBtn} onPressIn={startRecording} onPressOut={stopRecording}>
                    <Ionicons name="mic" size={24} color={voiceUri ? Colors.accent : Colors.textPrimary} />
                </Pressable>
             </View>
             <Text style={styles.charCount}>{content.length}/500</Text>
          </View>

          <ScrollView style={styles.composeBody} keyboardShouldPersistTaps="handled">
            {photo && (
              <View style={styles.photoPreviewWrap}>
                <Image source={{ uri: photo }} style={styles.photoPreview} contentFit="cover" />
                <Pressable style={styles.removePhoto} onPress={() => setPhoto(undefined)}><Ionicons name="close-circle" size={24} color="#fff" /></Pressable>
              </View>
            )}

            {voiceUri && (
              <View style={styles.voicePreview}>
                <Pressable style={styles.voicePlayBtn} onPress={togglePreview}>
                    <Ionicons name={isPlayingPreview ? "pause-circle" : "play-circle"} size={32} color={Colors.accent} />
                    <Text style={{color: '#fff', marginLeft: 8, fontWeight: '600'}}>
                      {isPlayingPreview 
                        ? (lang === "ko" ? "중지" : lang === "zh" ? "停止" : "Stop") 
                        : (lang === "ko" ? "녹음 듣기" : lang === "zh" ? "试听" : "Listen")}
                    </Text>
                </Pressable>
                <Pressable style={{marginLeft: 'auto'}} onPress={() => setVoiceUri(undefined)}><Ionicons name="trash-outline" size={20} color={Colors.textMuted}/></Pressable>
              </View>
            )}

            <TextInput
              style={styles.composeInput}
              value={content}
              onChangeText={setContent}
              placeholder={t(lang, "post_something")}
              placeholderTextColor={Colors.textMuted}
              multiline
              autoFocus
            />
          </ScrollView>

          {isRecording && (
            <View style={styles.recordingOverlay}>
                <LinearGradient colors={['transparent', 'rgba(232,70,124,0.8)']} style={styles.recordingBg} />
                <View style={styles.recordingContent}>
                    <Ionicons name="mic" size={60} color="#fff" />
                    <Text style={styles.recordingText}>{lang === "ko" ? "녹음 중..." : lang === "zh" ? "录音中..." : "Recording..."}</Text>
                    <Text style={styles.recordingSubText}>{lang === "ko" ? "손을 떼면 완료됩니다" : lang === "zh" ? "松手结束" : "Release to finish"}</Text>
                </View>
            </View>
          )}
        </View>
      </Modal>

      {/* 이미지 전체화면 모달 */}
      <Modal visible={!!selectedImage} transparent={true} animationType="fade">
        <View style={styles.fullScreenOverlay}>
          <Pressable style={styles.closeBtn} onPress={() => setSelectedImage(null)}>
            <Ionicons name="close" size={30} color="#fff" />
          </Pressable>
          {selectedImage && <Image source={{ uri: selectedImage }} style={styles.fullImage} contentFit="contain" />}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingBottom: 10, paddingTop: 8 },
  headerTitle: { fontSize: 28, fontWeight: "800", color: Colors.textPrimary },
  composeBtn: { borderRadius: 20, overflow: "hidden" },
  composeBtnGrad: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  tabPills: { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, backgroundColor: Colors.backgroundCard, borderRadius: 12, padding: 3, gap: 2, borderWidth: 1, borderColor: Colors.border },
  pill: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, borderRadius: 10, overflow: "hidden", position: "relative" },
  pillActive: {},
  pillText: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  pillTextActive: { color: "#fff" },
  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 10 },
  postCard: { backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 16, gap: 12, borderWidth: 1, borderColor: Colors.border, position: "relative", overflow: "hidden" },
  popularBadge: { position: 'absolute', top: 0, left: 0, backgroundColor: Colors.accent, paddingHorizontal: 8, paddingVertical: 4, borderBottomRightRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 4, zIndex: 1 },
  popularBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  postHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  postAvatar: { width: 40, height: 40, borderRadius: 20, overflow: "hidden" },
  postAvatarImg: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  postAuthorInfo: { gap: 2 },
  postAuthor: { fontSize: 15, fontWeight: "700", color: Colors.textPrimary },
  timeAgo: { fontSize: 12, color: Colors.textMuted },
  postContent: { fontSize: 15, color: Colors.textPrimary, lineHeight: 22 },
  voiceIndicator: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(232,70,124,0.1)', padding: 6, borderRadius: 8, alignSelf: 'flex-start' },
  voiceIndicatorText: { color: Colors.accent, fontSize: 12, fontWeight: '600' },
  postImage: { width: "100%", height: 220, borderRadius: 12, marginTop: 8, backgroundColor: '#222' },
  postFooter: { flexDirection: "row", gap: 16, paddingTop: 4 },
  likeBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  likeCnt: { fontSize: 13, fontWeight: "600", color: Colors.accent },
  commentBtn: { flexDirection: "row", alignItems: "center", gap: 5 },
  commentCnt: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },

  compose: { flex: 1, backgroundColor: Colors.background },
  composeHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 16 },
  composeCancel: { color: Colors.textSecondary, fontSize: 16 },
  composeTitle: { color: Colors.textPrimary, fontSize: 17, fontWeight: '700' },
  composePost: { color: Colors.accent, fontSize: 16, fontWeight: '700' },
  topToolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  toolbarLeft: { flexDirection: 'row', gap: 15 },
  toolBtn: { padding: 5 },
  composeBody: { flex: 1, paddingHorizontal: 20 },
  composeInput: { color: Colors.textPrimary, fontSize: 18, marginTop: 20, minHeight: 200, textAlignVertical: 'top' },
  photoPreviewWrap: { marginTop: 15, position: 'relative' },
  photoPreview: { width: '100%', height: 250, borderRadius: 15 },
  removePhoto: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 15 },
  voicePreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.backgroundCard, padding: 12, borderRadius: 12, marginTop: 15 },
  voicePlayBtn: { flexDirection: 'row', alignItems: 'center' },
  charCount: { color: Colors.textMuted, fontSize: 12 },

  recordingOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 999, justifyContent: 'center', alignItems: 'center' },
  recordingBg: { ...StyleSheet.absoluteFillObject },
  recordingContent: { alignItems: 'center', gap: 10 },
  recordingText: { color: '#fff', fontSize: 24, fontWeight: '800' },
  recordingSubText: { color: '#eee', fontSize: 14 },

  fullScreenOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  fullImage: { width: '100%', height: '80%' },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 10 },
});