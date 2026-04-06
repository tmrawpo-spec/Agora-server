import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  KeyboardAvoidingView,
  Alert,
  ActivityIndicator,
} from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/constants/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { useData, Message } from "@/contexts/DataContext";
import { SERVER_URL } from "@/constants/agora";
import { Colors } from "@/constants/colors";
import { t, Language } from "@/constants/i18n";

function firstString(value: string | string[] | undefined, fallback = ""): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return fallback;
}

function MessageBubble({ msg, isMe }: { msg: Message; isMe: boolean }) {
  if (msg.type === "call" || msg.type === "missed_call") {
    return (
      <View style={styles.callRecordWrap}>
        <View
          style={[
            styles.callRecord,
            { borderColor: msg.type === "missed_call" ? Colors.danger : Colors.teal },
          ]}
        >
          <Ionicons
            name="call"
            size={14}
            color={msg.type === "missed_call" ? Colors.danger : Colors.teal}
          />
          <Text
            style={[
              styles.callRecordText,
              { color: msg.type === "missed_call" ? Colors.danger : Colors.teal },
            ]}
          >
            {msg.text}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bubbleWrap,
        isMe ? styles.bubbleWrapMe : styles.bubbleWrapOther,
      ]}
    >
      {isMe ? (
        <LinearGradient
          colors={[Colors.accent, "#c01f5d"]}
          style={[styles.bubble, styles.bubbleMe]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
        >
          <Text style={styles.bubbleTextMe}>{msg.text}</Text>
        </LinearGradient>
      ) : (
        <View style={[styles.bubble, styles.bubbleOther]}>
          <Text style={styles.bubbleTextOther}>{msg.text}</Text>
        </View>
      )}
    </View>
  );
}

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const convoId = firstString(params.id);

  const { user } = useAuth();
  const {
  conversations,
  sendMessage,
  refreshConversations,
  subscribeToMessages,
  markConversationAsRead,
} = useData();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;
  const lang = ((user?.language as Language) || "ko") as Language;

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [realtimeMsgs, setRealtimeMsgs] = useState<Message[]>([]);
  const flatRef = useRef<FlatList>(null);

  useFocusEffect(
  useCallback(() => {
    if (!convoId) return;

    void refreshConversations();
    void markConversationAsRead(convoId);
  }, [convoId, refreshConversations, markConversationAsRead])
);

  useEffect(() => {
  if (!convoId) return;

  void markConversationAsRead(convoId);

  const unsubscribe = subscribeToMessages(convoId, (msgs) => {
    setRealtimeMsgs(msgs);
    void markConversationAsRead(convoId);
  });

  return () => unsubscribe();
}, [convoId, subscribeToMessages, markConversationAsRead]);

  const convo = conversations.find((c) => String(c.id) === String(convoId));
  const matchedUser = convo?.matchedUser;
  const msgs = realtimeMsgs.length > 0 ? realtimeMsgs : (convo?.messages ?? []);

  const handleProfilePress = () => {
    if (!matchedUser) return;

    const profileData = {
      id: matchedUser.id,
      nickname: matchedUser.nickname,
      profilePhoto: matchedUser.profilePhoto,
      gender: matchedUser.gender,
      age: matchedUser.age,
      location: matchedUser.location || (lang === "ko" ? "주변" : "Nearby"),
      voiceIntroUrl: matchedUser.voiceIntroUrl,
      isOnline: matchedUser.isOnline,
    };

    router.push({
      pathname: "/profile/[id]",
      params: { id: matchedUser.id, profileData: JSON.stringify(profileData) },
    });
  };

  async function handleSend() {
    if (!text.trim() || !convoId || !user?.id) return;

    const myText = text.trim();
    setText("");
    setSending(true);

    try {
      await sendMessage(convoId, user.id, myText);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (matchedUser?.fcmToken) {
        try {
          await fetch(`${SERVER_URL}/send-message-notification`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              targetToken: matchedUser.fcmToken,
              senderName: user.nickname ?? "User",
              message: myText,
              convoId,
            }),
          });
        } catch (e) {
          console.log("알림 전송 실패:", e);
        }
      }

      await refreshConversations();
    } catch (error) {
      console.error("전송 에러:", error);
      Alert.alert(
        "Error",
        lang === "ko" ? "메시지 전송에 실패했습니다." : "Failed to send message."
      );
    } finally {
      setSending(false);
    }
  }

  async function handleCall() {
    if (!convo || !user || !matchedUser) return;

    if (!convo.isFriend) {
      Alert.alert(
        lang === "ko" ? "알림" : "Notice",
        lang === "ko"
          ? "이 화면에서는 친구 상태일 때만 바로 통화할 수 있습니다."
          : "Direct calling from this screen is only available for friends."
      );
      return;
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const userRef = doc(db, "users", matchedUser.id);
      const snap = await getDoc(userRef);

      if (!snap.exists()) {
        Alert.alert("Error", lang === "ko" ? "상대 유저를 찾을 수 없습니다." : "User not found.");
        return;
      }

      const data = snap.data();
      const targetToken = data?.fcmToken || data?.TargetToken;

      if (!targetToken) {
        Alert.alert(
          "Error",
          lang === "ko"
            ? "상대방의 푸시 토큰이 없습니다."
            : "Target push token not found."
        );
        return;
      }

      router.push({
        pathname: "/matching/calling",
        params: {
          convoId: convo.id,
          profileName: matchedUser.nickname ?? "User",
          targetToken,
          isAlreadyFriend: "true",
          isLookTab: "false",
          callType: "friend",
        },
      });
    } catch (error) {
      console.error("통화 연결 실패:", error);
      Alert.alert(
        "Error",
        lang === "ko" ? "통화 연결에 실패했습니다." : "Failed to start call."
      );
    }
  }

  if (!convo) {
    return (
      <View
        style={[
          styles.container,
          { paddingTop: topPad, justifyContent: "center", alignItems: "center" },
        ]}
      >
        <ActivityIndicator size="large" color={Colors.accent} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </Pressable>

        <Pressable style={styles.headerUser} onPress={handleProfilePress}>
          <View style={styles.headerAvatar}>
            {matchedUser?.profilePhoto ? (
              <Image
                source={{ uri: matchedUser.profilePhoto }}
                style={styles.headerAvatarImg}
              />
            ) : (
              <LinearGradient
                colors={
                  matchedUser?.gender === "female"
                    ? [Colors.accent, "#c01f5d"]
                    : [Colors.blue, "#2255aa"]
                }
                style={styles.headerAvatarImg}
              >
                <Ionicons
                  name={matchedUser?.gender === "female" ? "female" : "male"}
                  size={18}
                  color="#fff"
                />
              </LinearGradient>
            )}
          </View>

          <View>
            <Text style={styles.headerName}>{matchedUser?.nickname ?? "Chat"}</Text>
            <Text style={styles.headerSub}>
              {matchedUser?.location || (lang === "ko" ? "주변" : "Nearby")} · {matchedUser?.age ?? "-"}
            </Text>
          </View>
        </Pressable>

        <Pressable style={styles.callBtn} onPress={handleCall}>
          <LinearGradient colors={[Colors.accent, "#c01f5d"]} style={styles.callBtnGrad}>
            <Ionicons name="call" size={18} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        <FlatList
          ref={flatRef}
          data={msgs}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => (
            <MessageBubble msg={item} isMe={item.senderId === user?.id} />
          )}
          contentContainerStyle={styles.msgList}
          onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Ionicons name="chatbubbles-outline" size={40} color={Colors.textMuted} />
              <Text style={styles.emptyChatText}>
                {lang === "ko" ? "대화를 시작해보세요" : "Say hello!"}
              </Text>
            </View>
          }
        />

        <View style={[styles.inputBar, { paddingBottom: botPad + 8 }]}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder={t(lang, "type_message")}
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={500}
            submitBehavior="blurAndSubmit"
            returnKeyType="send"
            onSubmitEditing={handleSend}
          />

          <Pressable
            onPress={handleSend}
            disabled={!text.trim() || sending}
            style={({ pressed }) => [
              styles.sendBtn,
              { opacity: text.trim() ? (pressed ? 0.7 : 1) : 0.4 },
            ]}
          >
            <LinearGradient colors={[Colors.accent, "#c01f5d"]} style={styles.sendBtnGrad}>
              <Ionicons name="send" size={18} color="#fff" />
            </LinearGradient>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    paddingTop: 4,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerUser: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, overflow: "hidden" },
  headerAvatarImg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  headerName: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  headerSub: { fontSize: 12, fontWeight: "400", color: Colors.textSecondary },
  callBtn: { borderRadius: 20, overflow: "hidden" },
  callBtnGrad: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
  },
  msgList: { paddingHorizontal: 16, paddingVertical: 16, gap: 8, flexGrow: 1 },
  bubbleWrap: { flexDirection: "row" },
  bubbleWrapMe: { justifyContent: "flex-end" },
  bubbleWrapOther: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "75%",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleMe: { borderBottomRightRadius: 4 },
  bubbleOther: {
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1,
    borderColor: Colors.border,
    borderBottomLeftRadius: 4,
  },
  bubbleTextMe: { color: "#fff", fontSize: 15, lineHeight: 21 },
  bubbleTextOther: { color: Colors.textPrimary, fontSize: 15, lineHeight: 21 },
  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyChatText: { color: Colors.textMuted, fontSize: 16 },
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
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
    paddingTop: 12,
    paddingBottom: 12,
    color: Colors.textPrimary,
    fontSize: 15,
    maxHeight: 100,
  },
  sendBtn: { borderRadius: 20, overflow: "hidden" },
  sendBtnGrad: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  callRecordWrap: { alignItems: "center", marginVertical: 4 },
  callRecord: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "rgba(0,0,0,0.2)",
  },
  callRecordText: { fontSize: 13, fontWeight: "600" },
});
