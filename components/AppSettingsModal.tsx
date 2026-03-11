import React, { useState, useEffect, useRef } from "react";
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
import * as Location from "expo-location";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { Language, LANGUAGE_LABELS, t } from "@/constants/i18n";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const LANGUAGES: Language[] = ["en", "ko", "ja", "es", "zh"];
const MAX_DISTANCE = 20000;

function generateSteps(): number[] {
  const steps: number[] = [];
  for (let i = 1; i <= 10; i++) steps.push(i);
  for (let i = 15; i <= 50; i += 5) steps.push(i);
  for (let i = 60; i <= 100; i += 10) steps.push(i);
  for (let i = 150; i <= 500; i += 50) steps.push(i);
  for (let i = 1000; i <= 3000; i += 500) steps.push(i);
  for (let i = 4000; i <= 20000; i += 1000) steps.push(i);
  return [...new Set(steps)].sort((a, b) => a - b);
}

const STEPS = generateSteps();

export function AppSettingsModal({ visible, onClose }: Props) {
  const { user, updateProfile, deleteAccount } = useAuth();
  const lang = (user?.language || "en") as Language;

  const [matchDistance, setMatchDistance] = useState(user?.matchDistance ?? MAX_DISTANCE);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const sliderWidthRef = useRef<number>(0);

  useEffect(() => {
    if (visible) {
      setMatchDistance(user?.matchDistance ?? MAX_DISTANCE);
    }
  }, [visible, user?.matchDistance]);

  async function handleLanguage(l: Language) {
    await updateProfile({ language: l });
  }

  async function handleDistanceSave(distance: number) {
    setMatchDistance(distance);
    await updateProfile({ matchDistance: distance });
  }

  function getStepFromPosition(x: number, width: number): number {
    const ratio = Math.max(0, Math.min(1, x / width));
    const idx = Math.round(ratio * (STEPS.length - 1));
    return STEPS[idx];
  }

  function handleSliderTouch(x: number) {
    if (sliderWidthRef.current === 0) return;
    const step = getStepFromPosition(x, sliderWidthRef.current);
    setMatchDistance(step);
  }

  function handleSliderTouchEnd(x: number) {
    if (sliderWidthRef.current === 0) return;
    const step = getStepFromPosition(x, sliderWidthRef.current);
    handleDistanceSave(step);
  }

  async function requestLocationForDistance() {
    setIsGettingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          lang === "ko" ? "위치 권한 필요" : "Location Required",
          lang === "ko" ? "거리 설정을 위해 위치 접근이 필요합니다." : "Location access is needed for distance filtering."
        );
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await updateProfile({
        locationCoords: { lat: loc.coords.latitude, lon: loc.coords.longitude },
      });
      Alert.alert(
        lang === "ko" ? "위치 업데이트 완료" : "Location Updated",
        lang === "ko" ? "내 위치가 업데이트됐어요!" : "Your location has been updated!"
      );
    } catch (e) {
      console.error(e);
    } finally {
      setIsGettingLocation(false);
    }
  }

  function handleDelete() {
    Alert.alert(
      t(lang, "delete_account"),
      "Are you sure?",
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

  const isMaxDistance = matchDistance >= MAX_DISTANCE;
  const distanceLabel = isMaxDistance
    ? (lang === "ko" ? "최대 (거리 제한 없음)" : "Max (No limit)")
    : `${matchDistance} km`;

  const thumbRatio =
    STEPS.indexOf(matchDistance) === -1
      ? 1
      : STEPS.indexOf(matchDistance) / (STEPS.length - 1);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{t(lang, "settings")}</Text>
          <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={15}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body}>

          {/* 보유 Seeds 표시 */}
          <View style={styles.seedCard}>
            <Text style={styles.seedLabel}>
              {lang === "ko" ? "보유 Seeds" : "Your Seeds"}
            </Text>
            <View style={styles.seedRow}>
              <Text style={styles.seedEmoji}>🌻</Text>
              <Text style={styles.seedAmount}>{(user?.coins ?? 0).toLocaleString()}</Text>
            </View>
          </View>

          <View style={styles.divider} />

          {/* 언어 설정 */}
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

          {/* 거리 설정 */}
          <Text style={styles.sectionLabel}>
            {lang === "ko" ? "매칭 거리 설정" : "Match Distance"}
          </Text>

          <View style={styles.distanceCard}>
            <View style={styles.distanceHeader}>
              <Ionicons name="location-outline" size={20} color={Colors.accent} />
              <Text style={styles.distanceValue}>{distanceLabel}</Text>
            </View>

            {/* 슬라이더 */}
            <View style={styles.sliderContainer}>
              <Text style={styles.sliderLabel}>1km</Text>
              <View
                style={styles.sliderTrack}
                onLayout={(e) => { sliderWidthRef.current = e.nativeEvent.layout.width; }}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderGrant={(e) => handleSliderTouch(e.nativeEvent.locationX)}
                onResponderMove={(e) => handleSliderTouch(e.nativeEvent.locationX)}
                onResponderRelease={(e) => handleSliderTouchEnd(e.nativeEvent.locationX)}
              >
                <View style={styles.sliderLine} />
                <View style={[styles.sliderFill, { width: `${thumbRatio * 100}%` as any }]} />
                <View style={[styles.sliderThumb, { left: `${thumbRatio * 100}%` as any }]} />
              </View>
              <Text style={styles.sliderLabel}>Max</Text>
            </View>

            {/* 프리셋 버튼 */}
            <View style={styles.presetRow}>
              {[5, 10, 15, 30, 50, 150, 300, 500, MAX_DISTANCE].map((d) => (
                <Pressable
                  key={d}
                  style={[styles.presetBtn, matchDistance === d && styles.presetSelected]}
                  onPress={() => handleDistanceSave(d)}
                >
                  <Text style={[styles.presetText, matchDistance === d && styles.presetTextSelected]}>
                    {d >= MAX_DISTANCE ? "Max" : `${d}km`}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* 위치 업데이트 버튼 */}
            <Pressable
              style={styles.locationUpdateBtn}
              onPress={requestLocationForDistance}
              disabled={isGettingLocation}
            >
              <Ionicons
                name={isGettingLocation ? "sync" : "location"}
                size={16}
                color={Colors.teal}
              />
              <Text style={styles.locationUpdateText}>
                {isGettingLocation
                  ? (lang === "ko" ? "위치 가져오는 중..." : "Getting location...")
                  : (lang === "ko" ? "내 위치 업데이트" : "Update my location")}
              </Text>
            </Pressable>
          </View>

          <View style={styles.divider} />

          <Pressable style={styles.dangerBtn} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color={Colors.danger} />
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
    paddingTop: Platform.OS === "android" ? 60 : 10,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 18, fontWeight: "700", color: Colors.textPrimary },
  closeBtn: { padding: 4 },
  body: { padding: 24, gap: 16 },
  seedCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    gap: 6,
  },
  seedLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  seedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  seedEmoji: { fontSize: 28 },
  seedAmount: {
    fontSize: 36,
    fontWeight: "900",
    color: Colors.gold,
  },
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
  langText: { fontWeight: "600", fontSize: 14, color: Colors.textSecondary },
  langTextSelected: { color: "#fff" },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 12 },
  distanceCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  distanceHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  distanceValue: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  sliderContainer: { flexDirection: "row", alignItems: "center", gap: 10 },
  sliderLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: "600",
    minWidth: 30,
    textAlign: "center",
  },
  sliderTrack: {
    flex: 1,
    height: 40,
    backgroundColor: "transparent",
    position: "relative",
    justifyContent: "center",
  },
  sliderLine: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 6,
    backgroundColor: Colors.border,
    borderRadius: 3,
  },
  sliderFill: {
    position: "absolute",
    left: 0,
    height: 6,
    backgroundColor: Colors.accent,
    borderRadius: 3,
  },
  sliderThumb: {
    position: "absolute",
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.accent,
    borderWidth: 3,
    borderColor: "#fff",
    top: -7,
    marginLeft: -10,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  presetRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  presetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  presetSelected: { backgroundColor: Colors.accent, borderColor: Colors.accent },
  presetText: { fontSize: 13, fontWeight: "600", color: Colors.textSecondary },
  presetTextSelected: { color: "#fff" },
  locationUpdateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.teal + "50",
    backgroundColor: Colors.teal + "10",
    alignSelf: "flex-start",
  },
  locationUpdateText: { fontSize: 13, fontWeight: "600", color: Colors.teal },
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
  dangerText: { color: Colors.danger, fontWeight: "700", fontSize: 15 },
});