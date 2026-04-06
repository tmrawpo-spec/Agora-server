import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  ScrollView,
  Alert,
  Platform,
  Linking,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import Purchases from "react-native-purchases";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { Language } from "@/constants/i18n";

const LEGAL_URL =
  "https://sites.google.com/view/nightonprivacypolicyterms/%ED%99%88";

const COIN_SHOP_OFFERING_ID = "coin_shop";

interface CoinProductMeta {
  productId: string;
  coins: number;
  labelKey: string;
  popular?: boolean;
  isVIP?: boolean;
  isFirstTrial?: boolean;
}

interface RevenueCatPackageLike {
  identifier: string;
  product: {
    identifier: string;
    priceString: string;
  };
}

interface CoinPackage extends CoinProductMeta {
  id: string;
  price: string;
  rcPackage: RevenueCatPackageLike;
}

const PRODUCT_META: CoinProductMeta[] = [
  {
    productId: "seed_130_first",
    coins: 130,
    labelKey: "First Time Only",
    isFirstTrial: true,
  },
  {
    productId: "seed_200",
    coins: 200,
    labelKey: "Starter",
  },
  {
    productId: "seed_370",
    coins: 370,
    labelKey: "Standard",
    popular: true,
  },
  {
    productId: "seed_750",
    coins: 750,
    labelKey: "Value",
  },
  {
    productId: "seed_1900",
    coins: 1900,
    labelKey: "Premium",
  },
  {
    productId: "seed_4000",
    coins: 4000,
    labelKey: "VIP Ultra",
    isVIP: true,
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function CoinShopModal({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { user, addCoins } = useAuth();

  const [packages, setPackages] = useState<CoinPackage[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  const lang = useMemo(() => (user?.language || "ko") as Language, [user?.language]);

  const topPadding = Platform.OS === "android" ? insets.top + 10 : 10;

  const filteredPackages = useMemo(() => {
    const isFirstTime = user?.isFirstPurchase ?? true;
    return packages.filter((pkg) => !pkg.isFirstTrial || isFirstTime);
  }, [packages, user?.isFirstPurchase]);

  useEffect(() => {
    if (!visible) return;

    let mounted = true;

    async function loadCoinPackages() {
      try {
        setLoadingProducts(true);

        const offerings = await Purchases.getOfferings();
        const coinShopOffering =
          offerings.all?.[COIN_SHOP_OFFERING_ID] ?? offerings.current;

        if (!coinShopOffering) {
          if (mounted) setPackages([]);
          return;
        }

        const mappedPackages = PRODUCT_META.map((meta) => {
          const rcPackage = coinShopOffering.availablePackages.find(
            (item: RevenueCatPackageLike) =>
              item.product.identifier === meta.productId || item.identifier === meta.productId
          );

          if (!rcPackage) return null;

          return {
            ...meta,
            id: meta.productId,
            price: rcPackage.product.priceString,
            rcPackage,
          };
        }).filter(Boolean) as CoinPackage[];

        if (mounted) {
          setPackages(mappedPackages);
        }
      } catch (e) {
        console.log("load coin offerings error:", e);
        if (mounted) {
          setPackages([]);
          Alert.alert(
            lang === "ko" ? "상품 불러오기 실패" : "Failed to Load Products",
            lang === "ko"
              ? "결제 상품 정보를 불러오지 못했어요."
              : "Unable to load purchase options."
          );
        }
      } finally {
        if (mounted) setLoadingProducts(false);
      }
    }

    loadCoinPackages();

    return () => {
      mounted = false;
    };
  }, [visible, lang]);

  async function openLegalUrl() {
    const supported = await Linking.canOpenURL(LEGAL_URL);
    if (!supported) {
      Alert.alert(
        lang === "ko" ? "링크 오류" : "Link Error",
        lang === "ko"
          ? "정책 페이지를 열 수 없어요."
          : "Unable to open the policy page."
      );
      return;
    }
    await Linking.openURL(LEGAL_URL);
  }

  async function handlePurchase(pkg: CoinPackage) {
    try {
      setPurchasing(pkg.id);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      await Purchases.purchasePackage(pkg.rcPackage as any);

      await addCoins(pkg.coins);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        lang === "ko" ? "구매 완료! 🌻" : "Purchase Complete! 🌻",
        lang === "ko"
          ? `🌻 ${pkg.coins.toLocaleString()} Seeds가 지급됐어요!`
          : `🌻 ${pkg.coins.toLocaleString()} Seeds have been added!`,
        [{ text: "OK", onPress: onClose }]
      );
    } catch (e: any) {
      console.log("purchase error:", e);

      if (!e?.userCancelled) {
        Alert.alert(
          lang === "ko" ? "구매 실패" : "Purchase Failed",
          lang === "ko"
            ? "결제 처리 중 문제가 발생했어요."
            : "There was a problem processing the purchase."
        );
      }
    } finally {
      setPurchasing(null);
    }
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

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>
            {lang === "ko" ? "보유 Seeds" : "Your Seeds"}
          </Text>
          <View style={styles.balanceRow}>
            <Text style={styles.balanceEmoji}>🌻</Text>
            <Text style={styles.balanceAmount}>
              {(user?.coins ?? 0).toLocaleString()}
            </Text>
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 20 }]}
        >
          <Text style={styles.sectionLabel}>
            {lang === "ko" ? "패키지 선택" : "Choose a Package"}
          </Text>

          {loadingProducts ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.accent} />
              <Text style={styles.loadingText}>
                {lang === "ko" ? "상품 불러오는 중..." : "Loading products..."}
              </Text>
            </View>
          ) : filteredPackages.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                {lang === "ko"
                  ? "현재 구매 가능한 상품이 없어요."
                  : "No products are available right now."}
              </Text>
            </View>
          ) : (
            filteredPackages.map((pkg) => (
              <Pressable
                key={pkg.id}
                style={({ pressed }) => [
                  styles.pkgCard,
                  pkg.popular && styles.pkgCardPopular,
                  pkg.isVIP && styles.pkgCardVIP,
                  { opacity: pressed || purchasing === pkg.id ? 0.85 : 1 },
                ]}
                onPress={() => handlePurchase(pkg)}
                disabled={!!purchasing || loadingProducts}
              >
                {pkg.isVIP && (
                  <LinearGradient
                    colors={["rgba(245, 200, 66, 0.1)", "rgba(245, 200, 66, 0.02)"]}
                    style={StyleSheet.absoluteFill}
                  />
                )}

                {(pkg.popular || pkg.isVIP) && (
                  <View
                    style={[
                      styles.popularBadge,
                      pkg.isVIP && { backgroundColor: Colors.gold },
                    ]}
                  >
                    <Text
                      style={[
                        styles.popularText,
                        pkg.isVIP && { color: "#1a1a1f" },
                      ]}
                    >
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
                    <Text style={[styles.pkgLabel, pkg.isVIP && { color: Colors.gold }]}>
                      {pkg.labelKey}
                    </Text>
                    <Text style={styles.pkgCoins}>
                      {pkg.coins.toLocaleString()} 🌻 Seeds
                    </Text>
                  </View>
                </View>

                <View style={styles.pkgRight}>
                  {purchasing === pkg.id ? (
                    <Text style={styles.purchasing}>...</Text>
                  ) : (
                    <LinearGradient
                      colors={
                        pkg.isVIP
                          ? ["#FFD700", "#FFA500"]
                          : pkg.popular
                          ? [Colors.accent, "#c01f5d"]
                          : [Colors.backgroundCard, Colors.border]
                      }
                      style={styles.pkgPrice}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      <Text
                        style={[
                          styles.pkgPriceText,
                          {
                            color:
                              pkg.popular || pkg.isVIP
                                ? "#1a1a1f"
                                : Colors.textPrimary,
                          },
                        ]}
                      >
                        {pkg.price}
                      </Text>
                    </LinearGradient>
                  )}
                </View>
              </Pressable>
            ))
          )}

          <View style={styles.legalCard}>
            <View style={styles.legalLinksRow}>
              <Pressable style={styles.legalLinkBtn} onPress={openLegalUrl}>
                <Text style={styles.legalLinkText}>
                  {lang === "ko" ? "개인정보 처리방침" : "Privacy Policy"}
                </Text>
              </Pressable>

              <Pressable style={styles.legalLinkBtn} onPress={openLegalUrl}>
                <Text style={styles.legalLinkText}>
                  {lang === "ko" ? "이용약관" : "Terms of Service"}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.legalCaption}>
              {lang === "ko"
                ? "구매 시 스토어 정책 및 이용약관이 적용됩니다."
                : "Store policies and terms apply to purchases."}
            </Text>
          </View>
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
  loadingBox: {
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundCard,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 20,
  },
  loadingText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  emptyBox: {
    minHeight: 120,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.backgroundCard,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    fontWeight: "600",
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
  pkgCoins: {
    fontSize: 14,
    color: Colors.textSecondary,
    marginTop: 2,
    fontWeight: "600",
  },
  pkgPrice: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },
  pkgPriceText: { fontSize: 16, fontWeight: "800" },
  pkgRight: { alignItems: "flex-end" },
  purchasing: { fontSize: 13, fontWeight: "600", color: Colors.textMuted },
  legalCard: {
    marginTop: 8,
    paddingTop: 8,
    gap: 12,
  },
  legalLinksRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  legalLinkBtn: {
    paddingVertical: 6,
    paddingHorizontal: 2,
  },
  legalLinkText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textDecorationLine: "underline",
  },
  legalCaption: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.textMuted,
  },
});