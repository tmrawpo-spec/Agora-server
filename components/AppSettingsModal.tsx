import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  Alert,
  ScrollView,
  Platform,
  SafeAreaView,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { Language, LANGUAGE_LABELS, t } from "@/constants/i18n";

interface Props {
  visible: boolean;
  onClose: () => void;
}

// 🟢 중국어(zh)를 목록에 추가
const LANGUAGES: Language[] = ["en", "ko", "ja", "es", "zh"];

export function AppSettingsModal({ visible, onClose }: Props) {
  const { user, updateProfile, deleteAccount } = useAuth();
  const lang = user?.language || "en";

  async function handleLanguage(l: Language) {
    // 언어를 업데이트하면 useAuth의 user 상태가 변하며 앱 전체 UI가 리렌더링됩니다.
    await updateProfile({ language: l });
  }

  function handleDelete() {
    Alert.alert(
      t(lang, "delete_account"), // 👈 번역 적용
      "Are you sure?", // 기호에 따라 i18n에 추가 가능
      [
        { text: t(lang, "cancel"), style: "cancel" },
        {
          text: t(lang, "delete_account"),
          style: "destructive",
          onPress: async () => {
            onClose();
            await deleteAccount();
            router.replace("/(auth)/welcome");
          },
        },
      ]
    );
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          {/* 🟢 제목에 번역 함수 적용 */}
          <Text style={styles.title}>{t(lang, "settings")}</Text>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={15}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          {/* 🟢 라벨에 번역 함수 적용 */}
          <Text style={styles.sectionLabel}>{t(lang, "language")}</Text>
          <View style={styles.langGrid}>
            {LANGUAGES.map((l) => (
              <Pressable
                key={l}
                style={[styles.langBtn, user?.language === l && styles.langSelected]}
                onPress={() => handleLanguage(l)}
              >
                {user?.language === l && (
                  <LinearGradient
                    colors={[Colors.accent, "#c01f5d"]}
                    style={StyleSheet.absoluteFill}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  />
                )}
                <Text style={[styles.langText, user?.language === l && styles.langTextSelected]}>
                  {LANGUAGE_LABELS[l]}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.divider} />

          <Pressable style={styles.dangerBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color={Colors.danger} />
            {/* 🟢 버튼 텍스트에 번역 함수 적용 */}
            <Text style={styles.dangerText}>{t(lang, "delete_account")}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'android' ? 60 : 10,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 18, fontWeight: "700", color: Colors.textPrimary },
  closeBtn: { padding: 4 },
  body: { padding: 24, gap: 16 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  langGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  langBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundCard,
    overflow: "hidden",
    position: "relative",
  },
  langSelected: { borderColor: Colors.accent },
  langText: {
    fontWeight: "600",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  langTextSelected: { color: "#fff" },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "rgba(232,70,70,0.1)",
    borderWidth: 1,
    borderColor: "rgba(232,70,70,0.3)",
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
  },
  dangerText: {
    color: Colors.danger,
    fontWeight: "700",
    fontSize: 15,
  },
});