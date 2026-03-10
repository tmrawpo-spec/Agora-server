import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";

interface Props {
  callerName: string;
  callerId: string;
  convoId: string;
  callerPhoto?: string;
  callerToken: string;          // 🔥 RootLayout에서 직접 전달됨
  onAccept: () => void;         // 🔥 callerToken은 이미 props로 있으므로 인자 필요 없음
  onReject: () => void;
}

export function IncomingCallModal({
  callerName,
  callerId,
  convoId,
  callerPhoto,
  callerToken,
  onAccept,
  onReject,
}: Props) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleAcceptPress = async () => {
    if (isConnecting) return;
    setIsConnecting(true);

    console.log("📞 [Modal] 수신자가 통화 수락 — callerToken:", callerToken);

    // 🔥 Firestore 조회 필요 없음 — RootLayout이 이미 최신 callerToken을 전달함
    onAccept();
  };

  return (
    <View style={styles.wrapper}>
      <BlurView intensity={90} tint="dark" style={styles.container}>
        <View style={styles.content}>
          <Image
            source={{ uri: callerPhoto || "https://via.placeholder.com/100" }}
            style={styles.avatar}
          />
          <View style={styles.info}>
            <Text style={styles.label}>전화 오는 중...</Text>
            <Text style={styles.name}>{callerName}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable
            style={[styles.btn, styles.reject]}
            onPress={onReject}
            disabled={isConnecting}
          >
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>

          <Pressable
            style={[styles.btn, styles.accept]}
            onPress={handleAcceptPress}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Ionicons name="call" size={24} color="#fff" />
            )}
          </Pressable>
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 24,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  info: {
    gap: 2,
  },
  label: {
    fontSize: 12,
    color: "rgba(255,255,255,0.6)",
  },
  name: {
    fontSize: 18,
    fontWeight: "700",
    color: "#fff",
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  btn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: "center",
    justifyContent: "center",
  },
  reject: {
    backgroundColor: "#ff3b30",
  },
  accept: {
    backgroundColor: "#34c759",
  },
});