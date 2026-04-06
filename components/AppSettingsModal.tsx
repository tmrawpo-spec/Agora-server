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
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Location from "expo-location";
import Purchases from "react-native-purchases";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { Language, LANGUAGE_LABELS, t } from "@/constants/i18n";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const LANGUAGES: Language[] = ["en", "ko", "ja", "es", "zh"];
const MAX_DISTANCE = 20000;
const LEGAL_URL =
  "https://sites.google.com/view/nightonprivacypolicyterms/%ED%99%88";

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

function formatLocationLabel(
  address?: Location.LocationGeocodedAddress | null,
  lang: Language = "en"
) {
  if (!address) {
    return lang === "ko" ? "위치 정보 없음" : "No location saved";
  }

  const candidates = [
    address.city,
    address.district,
    address.subregion,
    address.region,
    address.country,
  ].filter(Boolean) as string[];

  if (candidates.length === 0) {
    return lang === "ko" ? "위치 정보 없음" : "No location saved";
  }

  return [...new Set(candidates)].join(", ");
}

export function AppSettingsModal({ visible, onClose }: Props) {
  const { user, updateProfile, deleteAccount } = useAuth();
  const lang = (user?.language || "en") as Language;

  const [matchDistance, setMatchDistance] = useState(
    user?.matchDistance ?? MAX_DISTANCE
  );
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [currentLocationLabel, setCurrentLocationLabel] = useState(
    user?.location || (lang === "ko" ? "위치 정보 없음" : "No location saved")
  );

  const sliderWidthRef = useRef<number>(0);

  useEffect(() => {
    if (visible) {
      setMatchDistance(user?.matchDistance ?? MAX_DISTANCE);
      setCurrentLocationLabel(
        user?.location || (lang === "ko" ? "위치 정보 없음" : "No location saved")
      );
    }
  }, [visible, user?.matchDistance, user?.location, lang]);

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
          lang === "ko"
            ? "거리 설정과 현재 위치 표시를 위해 위치 접근이 필요합니다."
            : "Location access is needed for distance filtering and showing your current location."
        );
        return;
      }

      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      let nextLocationLabel =
        lang === "ko" ? "현재 위치 확인됨" : "Current location updated";

      try {
        const geocoded = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });

        if (geocoded?.length) {
          nextLocationLabel = formatLocationLabel(geocoded[0], lang);
        } else {
          nextLocationLabel = `${loc.coords.latitude.toFixed(
            4
          )}, ${loc.coords.longitude.toFixed(4)}`;
        }
      } catch {
        nextLocationLabel = `${loc.coords.latitude.toFixed(
          4
        )}, ${loc.coords.longitude.toFixed(4)}`;
      }

      setCurrentLocationLabel(nextLocationLabel);

      await updateProfile({
        locationCoords: {
          lat: loc.coords.latitude,
          lon: loc.coords.longitude,
        },
        location: nextLocationLabel,
      });

      Alert.alert(
        lang === "ko" ? "위치 업데이트 완료" : "Location Updated",
        lang === "ko"
          ? `현재 위치가 "${nextLocationLabel}"(으)로 업데이트됐어요.`
          : `Your current location was updated to "${nextLocationLabel}".`
      );
    } catch (e) {
      console.error(e);
      Alert.alert(
        lang === "ko" ? "위치 업데이트 실패" : "Location Update Failed",
        lang === "ko"
          ? "현재 위치를 가져오는 중 문제가 발생했어요."
          : "There was a problem getting your current location."
      );
    } finally {
      setIsGettingLocation(false);
    }
  }

  async function openLegalUrl() {
    try {
      await Linking.openURL(LEGAL_URL);
    } catch {
      Alert.alert(
        lang === "ko" ? "링크 오류" : "Link Error",
        lang === "ko"
          ? "정책 페이지를 열 수 없어요."
          : "Unable to open the policy page."
      );
    }
  }

  async function handleRestorePurchases() {
    try {
      setRestoring(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const customerInfo = await Purchases.restorePurchases();

      const hasActiveSubscription =
        (customerInfo?.activeSubscriptions?.length ?? 0) > 0;
      const hasActiveEntitlement =
        !!customerInfo?.entitlements?.active &&
        Object.keys(customerInfo.entitlements.active).length > 0;

      Alert.alert(
        lang === "ko" ? "구매 복원 완료" : "Purchases Restored",
        hasActiveSubscription || hasActiveEntitlement
          ? lang === "ko"
            ? "복원 가능한 구매 내역을 확인했어요."
            : "Your eligible purchases were restored."
          : lang === "ko"
          ? "복원할 구매 내역이 없어요."
          : "No purchases were available to restore."
      );
    } catch (e) {
      console.log("restore purchase error:", e);
      Alert.alert(
        lang === "ko" ? "복원 실패" : "Restore Failed",
        lang === "ko"
          ? "구매 복원 중 문제가 발생했어요."
          : "There was a problem restoring purchases."
      );
    } finally {
      setRestoring(false);
    }
  }

  function handleDelete() {
    Alert.alert(t(lang, "delete_account"), "Are you sure?", [
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
    ]);
  }

  const isMaxDistance = matchDistance >= MAX_DISTANCE;
  const distanceLabel = isMaxDistance
    ? lang === "ko"
      ? "최대 (거리 제한 없음)"
      : "Max (No limit)"
    : `${matchDistance} km`;

  const currentStepIndex = STEPS.indexOf(matchDistance);
  const thumbRatio =
    currentStepIndex === -1 ? 1 : currentStepIndex / (STEPS.length - 1);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />

        <SafeAreaView edges={["top", "left", "right", "bottom"]} style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{t(lang, "settings")}</Text>
            <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={15}>
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <View style={styles.seedCard}>
              <Text style={styles.seedLabel}>
                {lang === "ko" ? "보유 Seeds" : "Your Seeds"}
              </Text>
              <View style={styles.seedRow}>
                <Text style={styles.seedEmoji}>🌻</Text>
                <Text style={styles.seedAmount}>
                  {(user?.coins ?? 0).toLocaleString()}
                </Text>
              </View>
            </View>

            <View style={styles.divider} />

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
                  <Text
                    style={[
                      styles.langText,
                      user?.language === l && styles.langTextSelected,
                    ]}
                  >
                    {LANGUAGE_LABELS[l]}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>
              {lang === "ko" ? "매칭 거리 설정" : "Match Distance"}
            </Text>

            <View style={styles.distanceCard}>
              <View style={styles.distanceHeader}>
                <Ionicons name="location-outline" size={20} color={Colors.accent} />
                <Text style={styles.distanceValue}>{distanceLabel}</Text>
              </View>

              <View style={styles.currentLocationBox}>
                <View style={styles.currentLocationRow}>
                  <Ionicons
                    name="navigate-circle-outline"
                    size={18}
                    color={Colors.textSecondary}
                  />
                  <Text style={styles.currentLocationTitle}>
                    {lang === "ko" ? "현재 위치" : "Current Location"}
                  </Text>
                </View>
                <Text style={styles.currentLocationText}>{currentLocationLabel}</Text>
              </View>

              <View style={styles.sliderContainer}>
                <Text style={styles.sliderLabel}>1km</Text>
                <View
                  style={styles.sliderTrack}
                  onLayout={(e) => {
                    sliderWidthRef.current = e.nativeEvent.layout.width;
                  }}
                  onStartShouldSetResponder={() => true}
                  onMoveShouldSetResponder={() => true}
                  onResponderGrant={(e) => handleSliderTouch(e.nativeEvent.locationX)}
                  onResponderMove={(e) => handleSliderTouch(e.nativeEvent.locationX)}
                  onResponderRelease={(e) =>
                    handleSliderTouchEnd(e.nativeEvent.locationX)
                  }
                >
                  <View style={styles.sliderLine} />
                  <View
                    style={[styles.sliderFill, { width: `${thumbRatio * 100}%` as const }]}
                  />
                  <View
                    style={[styles.sliderThumb, { left: `${thumbRatio * 100}%` as const }]}
                  />
                </View>
                <Text style={styles.sliderLabel}>Max</Text>
              </View>

              <View style={styles.presetRow}>
                {[5, 10, 15, 30, 50, 150, 300, 500, MAX_DISTANCE].map((d) => (
                  <Pressable
                    key={d}
                    style={[styles.presetBtn, matchDistance === d && styles.presetSelected]}
                    onPress={() => handleDistanceSave(d)}
                  >
                    <Text
                      style={[
                        styles.presetText,
                        matchDistance === d && styles.presetTextSelected,
                      ]}
                    >
                      {d >= MAX_DISTANCE ? "Max" : `${d}km`}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable
                style={[styles.locationUpdateBtn, isGettingLocation && styles.disabledBtn]}
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
                    ? lang === "ko"
                      ? "위치 가져오는 중..."
                      : "Getting location..."
                    : lang === "ko"
                    ? "내 위치 업데이트"
                    : "Update my location"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionLabel}>
              {lang === "ko" ? "결제 및 약관" : "Billing & Legal"}
            </Text>

            <View style={styles.legalCard}>
              <Pressable
                style={[styles.restoreBtn, restoring && styles.disabledBtn]}
                onPress={handleRestorePurchases}
                disabled={restoring}
              >
                <Ionicons
                  name="refresh-circle-outline"
                  size={18}
                  color={Colors.accent}
                />
                <Text style={styles.restoreBtnText}>
                  {restoring
                    ? lang === "ko"
                      ? "복원 중..."
                      : "Restoring..."
                    : lang === "ko"
                    ? "구매 복원"
                    : "Restore Purchases"}
                </Text>
              </Pressable>

              <Pressable style={styles.legalLinkRow} onPress={openLegalUrl}>
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={Colors.textSecondary}
                />
                <Text style={styles.legalLinkRowText}>
                  {lang === "ko" ? "개인정보 처리방침" : "Privacy Policy"}
                </Text>
              </Pressable>

              <Pressable style={styles.legalLinkRow} onPress={openLegalUrl}>
                <Ionicons
                  name="document-outline"
                  size={18}
                  color={Colors.textSecondary}
                />
                <Text style={styles.legalLinkRowText}>
                  {lang === "ko" ? "이용약관" : "Terms of Service"}
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheet: {
    height: "92%",
    backgroundColor: Colors.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "android" ? 14 : 10,
    paddingBottom: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.background,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 24,
    gap: 16,
    paddingBottom: 80,
  },
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
  seedEmoji: {
    fontSize: 28,
  },
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
  langGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
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
  langSelected: {
    borderColor: Colors.accent,
  },
  langText: {
    fontWeight: "600",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  langTextSelected: {
    color: "#fff",
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 12,
  },
  distanceCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: 16,
  },
  distanceHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  distanceValue: {
    fontSize: 18,
    fontWeight: "800",
    color: Colors.textPrimary,
  },
  currentLocationBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 6,
  },
  currentLocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  currentLocationTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  currentLocationText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  sliderContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
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
    top: 10,
    marginLeft: -10,
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  presetRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  presetBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  presetSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  presetText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  presetTextSelected: {
    color: "#fff",
  },
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
  locationUpdateText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.teal,
  },
  legalCard: {
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    gap: 8,
  },
  restoreBtn: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 4,
  },
  restoreBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: Colors.accent,
  },
  legalLinkRow: {
    minHeight: 44,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  legalLinkRowText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
    textDecorationLine: "underline",
  },
  disabledBtn: {
    opacity: 0.7,
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