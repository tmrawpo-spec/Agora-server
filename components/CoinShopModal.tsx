import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Alert,
  Platform,
} from "react-native";
// ✅ 상단 여백 확보를 위한 인셋 임포트
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { t, Language } from "@/constants/i18n";

interface CoinPackage {
  id: string;
  coins: number;
  price: string;
  labelKey: string;
  popular?: boolean;
}

const PACKAGES: CoinPackage[] = [
  { id: "p1", coins: 50, price: "$0.99", labelKey: "Starter" },
  { id: "p2", coins: 150, price: "$2.49", labelKey: "Standard", popular: true },
  { id: "p3", coins: 350, price: "$4.99", labelKey: "Value" },
  { id: "p4", coins: 800, price: "$9.99", labelKey: "Premium" },
  { id: "p5", coins: 2000, price: "$19.99", labelKey: "Ultra" },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function CoinShopModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets(); // ✅ 기기별 인셋 값 가져오기
  const { user, addCoins } = useAuth();
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const lang = useMemo(() => (user?.language || "ko") as Language, [user?.language]);

  // ✅ [수정] 상단 겹침 방지 여백 계산
  // presentationStyle="formSheet"일 때는 시스템에서 여백을 어느 정도 주지만,
  // 더 확실하게 내리기 위해 인셋 값을 활용합니다.
  const topPadding = Platform.OS === "android" ? insets.top + 10 : 10;

  async function handlePurchase(pkg: CoinPackage) {
    setPurchasing(pkg.id);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setTimeout(async () => {
      await addCoins(pkg.coins);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPurchasing(null);

      Alert.alert(
        t(lang, "save"),
        `${pkg.coins} ${t(lang, "coins")} ${t(lang, "connected")}`,
        [{ text: "OK", onPress: onClose }]
      );
    }, 1200);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="formSheet"
      onRequestClose={onClose}
    >
      {/* ✅ [수정] container에 paddingTop 부여 */}
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <View style={styles.header}>
          <Text style={styles.title}>{t(lang, "coins")}</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.balanceCard}>
            <LinearGradient
              colors={["rgba(245,200,66,0.15)", "rgba(245,200,66,0.05)"]}
              style={styles.balanceGrad}
            >
              <Ionicons name="star" size={28} color={Colors.gold} />
              <Text style={styles.balanceLabel}>
                {t(lang, "edit_profile") === "프로필 수정" ? "보유 잔액" : "Current Balance"}
              </Text>
              <Text style={styles.balanceCount}>{user?.coins ?? 0}</Text>
              <Text style={styles.balanceSub}>{t(lang, "coins")}</Text>
            </LinearGradient>
          </View>

          <Text style={styles.coinUses}>
            {t(lang, "post_something") === "무엇을 하고 싶나요?" 
              ? "코인을 사용하여 메시지를 보내거나 통화를 시작하세요."
              : "Use coins to send messages or start calls with others."}
          </Text>

          <Text style={styles.sectionLabel}>
            {t(lang, "edit_profile") === "프로필 수정" ? "패키지 선택" : "Choose a Package"}
          </Text>

          {PACKAGES.map((pkg) => (
            <Pressable
              key={pkg.id}
              style={({ pressed }) => [
                styles.pkgCard,
                pkg.popular && styles.pkgCardPopular,
                { opacity: pressed || purchasing === pkg.id ? 0.85 : 1 },
              ]}
              onPress={() => handlePurchase(pkg)}
              disabled={!!purchasing}
            >
              {pkg.popular && (
                <View style={styles.popularBadge}>
                  <Text style={styles.popularText}>POPULAR</Text>
                </View>
              )}
              <View style={styles.pkgLeft}>
                <View style={styles.coinIconWrap}>
                  <LinearGradient
                    colors={["#f5c842", "#e8a020"]}
                    style={styles.coinIcon}
                  >
                    <Ionicons name="star" size={18} color="#1a1a1f" />
                  </LinearGradient>
                </View>
                <View>
                  <Text style={styles.pkgLabel}>{pkg.labelKey}</Text>
                  <Text style={styles.pkgCoins}>{pkg.coins.toLocaleString()} {t(lang, "coins")}</Text>
                </View>
              </View>
              <View style={styles.pkgRight}>
                {purchasing === pkg.id ? (
                  <Text style={styles.purchasing}>...</Text>
                ) : (
                  <LinearGradient
                    colors={pkg.popular ? [Colors.accent, "#c01f5d"] : [Colors.backgroundCard, Colors.backgroundElevated]}
                    style={styles.pkgPrice}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={[styles.pkgPriceText, { color: pkg.popular ? "#fff" : Colors.textPrimary }]}>
                      {pkg.price}
                    </Text>
                  </LinearGradient>
                )}
              </View>
            </Pressable>
          ))}

          <Text style={styles.disclaimer}>
            {t(lang, "cancel") === "취소" ? "본 구매는 테스트용 시뮬레이션입니다." : "Purchases are simulated for demonstration."}
          </Text>
        </ScrollView>
      </View>
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
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary }, // ✅ 폰트 굵기 강화
  closeBtn: { padding: 4 },
  body: { padding: 20, gap: 14 },
  balanceCard: { borderRadius: 18, overflow: "hidden" },
  balanceGrad: {
    alignItems: "center",
    paddingVertical: 24,
    gap: 4,
    borderWidth: 1,
    borderColor: "rgba(245,200,66,0.3)",
    borderRadius: 18,
  },
  balanceLabel: {
    fontSize: 12,
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  balanceCount: {
    fontSize: 48,
    fontWeight: "800",
    color: Colors.gold,
    lineHeight: 56,
  },
  balanceSub: {
    fontSize: 13,
    color: Colors.textMuted,
  },
  coinUses: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: 10,
  },
  pkgCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: Colors.backgroundCard,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    position: "relative",
    overflow: "hidden",
  },
  pkgCardPopular: {
    borderColor: Colors.accent,
  },
  popularBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: Colors.accent,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  popularText: {
    fontSize: 9,
    fontWeight: "700",
    color: "#fff",
    letterSpacing: 0.5,
  },
  pkgLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  coinIconWrap: {},
  coinIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  pkgLabel: { fontSize: 15, fontWeight: "700", color: Colors.textPrimary },
  pkgCoins: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  pkgRight: {},
  pkgPrice: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
  },
  pkgPriceText: { fontSize: 15, fontWeight: "700" },
  purchasing: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  disclaimer: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: "center",
    marginTop: 10,
    paddingBottom: 20,
  },
});