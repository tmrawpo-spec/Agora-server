import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  Platform,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { useData, Conversation } from "@/contexts/DataContext";
import { Colors } from "@/constants/colors";
import { t, Language } from "@/constants/i18n";

function FriendItem({
  convo,
  onChat,
  onBlock,
  isBlocked,
  onUnblock,
  lang,
}: {
  convo: Conversation;
  onChat: () => void;
  onBlock: () => void;
  isBlocked: boolean;
  onUnblock: () => void;
  lang: Language;
}) {
  const p = convo.matchedUser;

  const handleAvatarPress = () => {
    if (isBlocked) return;

    const profileData = {
      id: p.id,
      nickname: p.nickname,
      profilePhoto: p.profilePhoto,
      gender: p.gender,
      age: p.age,
      location: p.location || (lang === "ko" ? "주변" : lang === "zh" ? "附近" : "Nearby"),
      voiceIntroUrl: p.voiceIntroUrl,
      isOnline: p.isOnline,
    };

    router.push({
      pathname: "/profile/[id]",
      params: { 
        id: p.id, 
        profileData: JSON.stringify(profileData) 
      },
    });
  };

  return (
    <View style={[styles.item, isBlocked && styles.itemBlocked]}>
      <View style={styles.itemMain}>
        <Pressable 
          style={({ pressed }) => [styles.avatarWrap, pressed && !isBlocked && { opacity: 0.8 }]} 
          onPress={handleAvatarPress}
        >
          {p.profilePhoto ? (
            <Image source={{ uri: p.profilePhoto }} style={styles.avatar} />
          ) : (
            <LinearGradient
              colors={p.gender === "female" ? [Colors.accent, "#c01f5d"] : [Colors.blue, "#2255aa"]}
              style={styles.avatar}
            >
              <Ionicons
                name={p.gender === "female" ? "female" : "male"}
                size={20}
                color="#fff"
              />
            </LinearGradient>
          )}
          {!isBlocked && (
            <View
              style={[
                styles.onlineDot,
                { backgroundColor: p.isOnline ? Colors.success : Colors.textMuted },
              ]}
            />
          )}
          {isBlocked && (
            <View style={styles.blockedBadge}>
              <Ionicons name="ban" size={10} color="#fff" />
            </View>
          )}
        </Pressable>

        <Pressable 
          style={({ pressed }) => [styles.info, pressed && !isBlocked && { opacity: 0.7 }]} 
          onPress={isBlocked ? undefined : onChat}
        >
          <Text style={[styles.name, isBlocked && styles.nameBlocked]}>{p.nickname}</Text>
          <Text style={styles.sub} numberOfLines={1}>
            {isBlocked
              ? (lang === "ko" ? "차단됨" : lang === "zh" ? "已屏蔽" : "Blocked")
              : convo.lastMessage
              ? convo.lastMessage
              : `${p.distanceKm || 0} km ${lang === "ko" ? "주변" : lang === "zh" ? "附近" : "away"}`}
          </Text>
        </Pressable>
      </View>

      <View style={styles.actions}>
        {!isBlocked ? (
          <>
            <Pressable
              style={({ pressed }) => [styles.chatBtn, pressed && { opacity: 0.8 }]}
              onPress={onChat}
            >
              <LinearGradient
                colors={[Colors.accent, "#c01f5d"]}
                style={styles.chatBtnGrad}
              >
                <Ionicons name="chatbubble" size={16} color="#fff" />
              </LinearGradient>
            </Pressable>
            <Pressable 
              style={({ pressed }) => [styles.moreBtn, pressed && { opacity: 0.7 }]} 
              onPress={onBlock}
            >
              <Ionicons name="ban" size={20} color={Colors.textMuted} />
            </Pressable>
          </>
        ) : (
          <Pressable 
            style={({ pressed }) => [styles.unblockBtn, pressed && { backgroundColor: Colors.border }]} 
            onPress={onUnblock}
          >
            <Text style={styles.unblockText}>
              {lang === "ko" ? "차단 해제" : lang === "zh" ? "取消屏蔽" : "Unblock"}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { conversations, blockFriend, unblockFriend, refreshConversations } = useData();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const lang = (user?.language || "ko") as Language; // 기본값 ko로 통일

  const [tab, setTab] = useState<"friends" | "blocked">("friends");

  // 화면이 포커스될 때마다 데이터 동기화
  useFocusEffect(
    useCallback(() => {
      refreshConversations();
    }, [refreshConversations])
  );

  // ✅ [수정] 필터링 조건 강화: 차단되지 않았고, 대화방이 존재한다면 일단 노출
  const friends = conversations.filter((c) => !c.isBlocked);
  const blocked = conversations.filter((c) => c.isBlocked);

  const handleBlock = async (convoId: string, nickname: string) => {
    Alert.alert(
      lang === "ko" ? "친구 차단" : lang === "zh" ? "屏蔽好友" : "Block Friend",
      lang === "ko" 
        ? `${nickname}님을 차단하시겠습니까? 친구 목록에서 삭제됩니다.` 
        : lang === "zh" 
        ? `确定要屏蔽 ${nickname} 吗？将从好友列表中移除。` 
        : `Are you sure you want to block ${nickname}? They will be removed from your friends list.`,
      [
        { text: lang === "ko" ? "취소" : lang === "zh" ? "取消" : "Cancel", style: "cancel" },
        {
          text: lang === "ko" ? "차단" : lang === "zh" ? "屏蔽" : "Block",
          style: "destructive",
          onPress: async () => {
            await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            await blockFriend(convoId);
            await refreshConversations();
          },
        },
      ]
    );
  };

  const handleUnblock = async (convoId: string) => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await unblockFriend(convoId);
    await refreshConversations();
  };

  const displayed = tab === "friends" ? friends : blocked;

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{t(lang, "chat")}</Text>
        <View style={styles.tabPills}>
          <Pressable
            style={[styles.pill, tab === "friends" && styles.pillActive]}
            onPress={() => {
                Haptics.selectionAsync();
                setTab("friends");
            }}
          >
            <Text style={[styles.pillText, tab === "friends" && styles.pillTextActive]}>
              {lang === "ko" ? "친구" : lang === "zh" ? "好友" : "Friends"} {friends.length > 0 ? `(${friends.length})` : ""}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.pill, tab === "blocked" && styles.pillActive]}
            onPress={() => {
                Haptics.selectionAsync();
                setTab("blocked");
            }}
          >
            <Text style={[styles.pillText, tab === "blocked" && styles.pillTextActive]}>
              {lang === "ko" ? "차단됨" : lang === "zh" ? "已屏蔽" : "Blocked"} {blocked.length > 0 ? `(${blocked.length})` : ""}
            </Text>
          </Pressable>
        </View>
      </View>

      <FlatList
        data={displayed}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <FriendItem
            convo={item}
            lang={lang}
            isBlocked={!!item.isBlocked}
            onChat={() =>
              router.push({ pathname: "/chat/[id]", params: { id: item.id } })
            }
            onBlock={() => handleBlock(item.id, item.matchedUser.nickname)}
            onUnblock={() => handleUnblock(item.id)}
          />
        )}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name={tab === "friends" ? "people-outline" : "ban-outline"}
              size={48}
              color={Colors.textMuted}
            />
            <Text style={styles.emptyTitle}>
              {tab === "friends" 
                ? (lang === "ko" ? "친구가 없습니다" : lang === "zh" ? "暂无好友" : "No friends yet") 
                : (lang === "ko" ? "차단한 유저가 없습니다" : lang === "zh" ? "暂无屏蔽用户" : "No blocked users")}
            </Text>
            <Text style={styles.emptyText}>
              {tab === "friends"
                ? (lang === "ko" ? "누군가와 매칭되고 대화를 시작해 친구가 되어보세요" : lang === "zh" ? "开始对话，结交好友吧" : "Start a conversation to make friends")
                : (lang === "ko" ? "차단한 사용자들이 여기에 표시됩니다" : lang === "zh" ? "屏蔽的用户将显示在这里" : "Users you block will appear here")}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 14,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: Colors.textPrimary,
  },
  tabPills: {
    flexDirection: "row",
    backgroundColor: Colors.backgroundCard,
    borderRadius: 12,
    padding: 3,
    gap: 2,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pill: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center",
  },
  pillActive: {
    backgroundColor: Colors.accent,
  },
  pillText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textMuted,
  },
  pillTextActive: { color: "#fff" },
  list: { paddingHorizontal: 16, paddingBottom: 120, gap: 8 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  itemBlocked: {
    opacity: 0.6,
    borderColor: Colors.border,
  },
  itemMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarWrap: { position: "relative" },
  avatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  onlineDot: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.backgroundCard,
  },
  blockedBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.danger,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: Colors.backgroundCard,
  },
  info: { flex: 1, gap: 3, paddingVertical: 4 },
  name: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  nameBlocked: { color: Colors.textMuted },
  sub: {
    fontSize: 13,
    color: Colors.textSecondary,
  },
  actions: { flexDirection: "row", alignItems: "center", gap: 8 },
  chatBtn: { borderRadius: 20, overflow: "hidden" },
  chatBtnGrad: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  moreBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unblockBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.teal,
  },
  unblockText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.teal,
  },
  empty: { alignItems: "center", marginTop: 80, gap: 12, paddingHorizontal: 40 },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.textSecondary,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textMuted,
    textAlign: "center",
    lineHeight: 20,
  },
});