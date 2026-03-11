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
  isVIP?: boolean;
  isFirstTrial?: boolean;
}

const PACKAGES_DATA: CoinPackage[] = [
  { id: "p1", coins: 130, price: "$0.99", labelKey: "First Time Only", isFirstTrial: true },
  { id: "p2", coins: 200, price: "$2.99", labelKey: "Starter" },
  { id: "p3", coins: 370, price: "$4.99", labelKey: "Standard", popular: true },
  { id: "p4", coins: 750, price: "$9.99", labelKey: "Value" },
  { id: "p5", coins: 1900, price: "$24.99", labelKey: "Premium" },
  { id: "p6", coins: 4000, price: "$49.99", labelKey: "VIP Ultra", isVIP: true },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function CoinShopModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { user, addCoins } = useAuth();
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const lang = useMemo(() => (user?.language || "ko") as Language, [user?.language]);

  const filteredPackages = useMemo(() => {
    const isFirstTime = user?.isFirstPurchase ?? true;
    return PACKAGES_DATA.filter(pkg => !pkg.isFirstTrial || isFirstTime);
  }, [user?.isFirstPurchase]);

  const topPadding = Platform.OS === "android" ? insets.top + 10 : 10;

  async function handlePurchase(pkg: CoinPackage) {
    setPurchasing(pkg.id);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    setTimeout(async () => {
      await addCoins(pkg.coins);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setPurchasing(null);

      Alert.alert(
        lang === "ko" ? "구매 완료! 🌻" : "Purchase Complete! 🌻",
        lang === "ko"
          ? `🌻 ${pkg.coins.toLocaleString()} Seeds가 지급됐어요!`
          : `🌻 ${pkg.coins.toLocaleString()} Seeds have been added!`,
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
      <View style={[styles.container, { paddingTop: topPadding }]}>
        <View style={styles.header}>
          <Text style={styles.title}>🌻 Seed Shop</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={Colors.textSecondary} />
          </Pressable>
        </View>

        {/* 보유 seed 표시 */}
        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>
            {lang === "ko" ? "보유 Seeds" : "Your Seeds"}
          </Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceEmoji}>🌻</Text>
            <Text style={styles.balanceAmount}>{(user?.coins ?? 0).toLocaleString()}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.sectionLabel}>
            {lang === "ko" ? "패키지 선택" : "Choose a Package"}
          </Text>

          {filteredPackages.map((pkg) => (
            <Pressable
              key={pkg.id}
              style={({ pressed }) => [
                styles.pkgCard,
                pkg.popular && styles.pkgCardPopular,
                pkg.isVIP && styles.pkgCardVIP,
                { opacity: pressed || purchasing === pkg.id ? 0.85 : 1 },
              ]}
              onPress={() => handlePurchase(pkg)}
              disabled={!!purchasing}
            >
              {pkg.isVIP && (
                <LinearGradient
                  colors={["rgba(245, 200, 66, 0.1)", "rgba(245, 200, 66, 0.02)"]}
                  style={StyleSheet.absoluteFill}
                />
              )}

              {(pkg.popular || pkg.isVIP) && (
                <View style={[styles.popularBadge, pkg.isVIP && { backgroundColor: Colors.gold }]}>
                  <Text style={[styles.popularText, pkg.isVIP && { color: "#1a1a1f" }]}>
                    {pkg.isVIP ? "BEST VALUE" : "POPULAR"}
                  </Text>
                </View>
              )}

              <View style={styles.pkgLeft}>
                <LinearGradient
                  colors={pkg.isVIP ? ["#FFD700", "#FFA500"] : ["#f5c842", "#e8a020"]}
                  style={styles.coinIcon}
                >
                  <Text style={styles.seedEmoji}>{pkg.isVIP ? "🏆" : "🌻"}</Text>
                </LinearGradient>
                <View>
                  <Text style={[styles.pkgLabel, pkg.isVIP && { color: Colors.gold }]}>{pkg.labelKey}</Text>
                  <Text style={styles.pkgCoins}>{pkg.coins.toLocaleString()} 🌻 Seeds</Text>
                </View>
              </View>

              <View style={styles.pkgRight}>
                {purchasing === pkg.id ? (
                  <Text style={styles.purchasing}>...</Text>
                ) : (
                  <LinearGradient
                    colors={pkg.isVIP ? ["#FFD700", "#FFA500"] : (pkg.popular ? [Colors.accent, "#c01f5d"] : [Colors.backgroundCard, Colors.border])}
                    style={styles.pkgPrice}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    <Text style={[styles.pkgPriceText, { color: (pkg.popular || pkg.isVIP) ? "#1a1a1f" : Colors.textPrimary }]}>
                      {pkg.price}
                    </Text>
                  </LinearGradient>
                )}
              </View>
            </Pressable>
          ))}
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
  title: { fontSize: 18, fontWeight: "800", color: Colors.textPrimary },
  closeBtn: { padding: 4 },
  balanceCard: {
    marginHorizontal: 20,
    marginTop: 16,
    padding: 16,
    backgroundColor: Colors.backgroundCard,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    gap: 4,
  },
  balanceLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  balanceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  balanceEmoji: { fontSize: 22 },
  balanceAmount: {
    fontSize: 28,
    fontWeight: "900",
    color: Colors.gold,
  },
  body: { padding: 20, gap: 14 },
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
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    position: "relative",
    overflow: "hidden",
  },
  pkgCardPopular: {
    borderColor: Colors.accent,
    borderWidth: 1.5,
  },
  pkgCardVIP: {
    borderColor: Colors.gold,
    borderWidth: 2,
    backgroundColor: "#1c1c1e",
    shadowColor: Colors.gold,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  popularBadge: {
    position: "absolute",
    top: 0,
    right: 0,
    backgroundColor: Colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderBottomLeftRadius: 12,
  },
  popularText: { fontSize: 10, fontWeight: "900", color: "#fff" },
  pkgLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  coinIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  seedEmoji: { fontSize: 20 },
  pkgLabel: { fontSize: 15, fontWeight: "800", color: Colors.textPrimary },
  pkgCoins: { fontSize: 14, color: Colors.textSecondary, marginTop: 2, fontWeight: "600" },
  pkgPrice: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  pkgPriceText: { fontSize: 16, fontWeight: "800" },
  pkgRight: { alignItems: "flex-end" },
  purchasing: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
});