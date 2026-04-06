import React from "react";
import { Modal, View, Text, StyleSheet, Pressable } from "react-native";
import { router } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { useMatch } from "@/contexts/MatchContext";
import { Colors } from "@/constants/colors";

export default function MatchFoundModal() {
  const { user } = useAuth();
  const { status, foundUser, resetMatch } = useMatch();

  if (!foundUser) return null;

  const matchUser = foundUser;
  const visible = status === "found";

  async function handleAccept() {
    const convoId = [user?.id, matchUser.id].sort().join("_");

    resetMatch();

    router.push({
      pathname: "/matching/calling",
      params: {
        convoId,
        profileName: matchUser.nickname,
        targetToken: matchUser.fcmToken || "",
        isAlreadyFriend: "false",
        isLookTab: "false",
        isReceiver: "false",
        callType: "random",
      },
    });
  }

  function handleDecline() {
    resetMatch();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDecline}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.glow} />

          <Text style={styles.title}>매칭 상대를 찾았어요</Text>

          <View style={styles.avatar}>
            <LinearGradient
              colors={
                matchUser.gender === "female"
                  ? [Colors.accent, "#c01f5d"]
                  : [Colors.blue, "#2255aa"]
              }
              style={styles.avatarGrad}
            >
              <Ionicons
                name={matchUser.gender === "female" ? "female" : "male"}
                size={40}
                color="#fff"
              />
            </LinearGradient>
          </View>

          <Text style={styles.name}>{matchUser.nickname}</Text>

          <Text style={styles.sub}>
            {matchUser.age ?? "?"}세
            {typeof matchUser.distanceKm === "number"
              ? ` · ${matchUser.distanceKm}km`
              : ""}
          </Text>

          <View style={styles.actions}>
            <Pressable style={styles.declineBtn} onPress={handleDecline}>
              <Ionicons name="close" size={28} color={Colors.danger} />
            </Pressable>

            <Pressable style={styles.acceptWrap} onPress={handleAccept}>
              <LinearGradient
                colors={[Colors.accent, "#c01f5d"]}
                style={styles.acceptBtn}
              >
                <Ionicons name="call" size={24} color="#fff" />
                <Text style={styles.acceptText}>수락</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
    backgroundColor: Colors.backgroundCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    top: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: "rgba(232,70,124,0.12)",
  },
  title: {
    color: Colors.accent,
    fontSize: 24,
    fontWeight: "800",
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: "hidden",
    marginTop: 18,
  },
  avatarGrad: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  name: {
    marginTop: 16,
    color: Colors.textPrimary,
    fontSize: 22,
    fontWeight: "800",
  },
  sub: {
    marginTop: 6,
    color: Colors.textSecondary,
    fontSize: 14,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 18,
    marginTop: 24,
  },
  declineBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(232,70,70,0.12)",
    borderWidth: 2,
    borderColor: Colors.danger,
  },
  acceptWrap: {
    borderRadius: 32,
    overflow: "hidden",
  },
  acceptBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 18,
  },
  acceptText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
});
