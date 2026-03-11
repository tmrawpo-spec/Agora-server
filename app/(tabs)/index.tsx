import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
  ActivityIndicator,
  AppState,
} from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useAuth, Gender } from "@/contexts/AuthContext";
import { useData, UserProfile, Visitor } from "@/contexts/DataContext";
import { Colors } from "@/constants/colors";
import { t, Language } from "@/constants/i18n";
import { AppSettingsModal } from "@/components/AppSettingsModal";
import { ProfileEditModal } from "@/components/ProfileEditModal";
import { CoinShopModal } from "@/components/CoinShopModal";
import { db } from "@/constants/firebase";
import { collection, query, where, getDocs, limit } from "firebase/firestore";

type TabType = "all" | "nearby";

function OnlineIndicator({ isOnline }: { isOnline: boolean }) {
  return (
    <View
      style={[
        styles.onlineDot,
        { backgroundColor: isOnline ? Colors.success : Colors.textMuted },
      ]}
    />
  );
}

function ProfileCardItem({
  profile,
  onPress,
  isBlurred = false,
  myGender,
}: {
  profile: UserProfile | Visitor;
  onPress: () => void;
  isBlurred?: boolean;
  myGender?: Gender;
}) {
  const finalBlurred = myGender === "female" ? false : isBlurred;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.8 : 1 }]}
      onPress={onPress}
    >
      <View style={styles.cardAvatar}>
        {profile.profilePhoto ? (
          <Image source={{ uri: profile.profilePhoto }} style={styles.avatar} />
        ) : (
          <LinearGradient
            colors={
              profile.gender === "female"
                ? [Colors.accent, "#c01f5d"]
                : [Colors.blue, "#2255aa"]
            }
            style={styles.avatarGrad}
          >
            <Ionicons
              name={profile.gender === "female" ? "female" : "male"}
              size={28}
              color="#fff"
            />
          </LinearGradient>
        )}
        <OnlineIndicator isOnline={profile.isOnline} />
        {finalBlurred && (
          <BlurView intensity={80} style={styles.blurOverlay} tint="dark">
            <Ionicons name="lock-closed" size={20} color="#fff" />
          </BlurView>
        )}
      </View>

      <View style={styles.cardInfo}>
        <Text style={styles.cardName}>{finalBlurred ? "???" : profile.nickname}</Text>
        <Text style={styles.cardSub}>
          {profile.age} · {profile.distanceKm} km
        </Text>
      </View>

      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

function calcDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { visitors, recordVisit } = useData();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const lang = useMemo(() => (user?.language || "ko") as Language, [user?.language]);

  const [allProfiles, setAllProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [showSettings, setShowSettings] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showSeedShop, setShowSeedShop] = useState(false);

  const loadRealUsers = useCallback(async () => {
    if (!user?.id || !user?.gender) return;
    setLoading(true);
    setLoadError(false);
    try {
      const oppositeGender = user.gender === "male" ? "female" : "male";
      const q = query(
        collection(db, "users"),
        where("gender", "==", oppositeGender),
        limit(100)
      );
      const snap = await getDocs(q);
      const profiles: UserProfile[] = [];

      for (const d of snap.docs) {
        if (d.id === user.id) continue;
        const data = d.data();

        let distanceKm = 0;
        if (user.locationCoords && data.locationCoords) {
          distanceKm = Math.round(
            calcDistance(
              user.locationCoords.lat,
              user.locationCoords.lon,
              data.locationCoords.lat,
              data.locationCoords.lon
            )
          );
        }

        profiles.push({
          id: d.id,
          nickname: data.nickname || "Unknown",
          gender: data.gender,
          age: data.age || 0,
          language: data.language || "en",
          location: data.location || "",
          distanceKm,
          profilePhoto: data.profilePhoto || "",
          isOnline: data.isOnline ?? false,
          fcmToken: data.fcmToken || "",
          voiceIntroUrl: data.voiceIntroUrl || "",
        });
      }

      profiles.sort((a, b) => a.distanceKm - b.distanceKm);
      setAllProfiles(profiles);
    } catch (e) {
      console.error("유저 목록 불러오기 실패:", e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [user?.id, user?.gender, user?.locationCoords]);

  // 최초 로드
  useEffect(() => {
    if (user?.id && user?.gender) {
      loadRealUsers();
    }
  }, [user?.id, user?.gender]);

  // 탭 포커스 시 재로드 (다른 탭 갔다 돌아올 때)
  useFocusEffect(
    useCallback(() => {
      if (user?.id && user?.gender && allProfiles.length === 0) {
        loadRealUsers();
      }
    }, [user?.id, user?.gender, allProfiles.length])
  );

  // 앱이 백그라운드에서 포그라운드로 복귀할 때 재로드
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active" && user?.id && user?.gender) {
        loadRealUsers();
      }
    });
    return () => subscription.remove();
  }, [loadRealUsers]);

  const nearbySectionUsers = useMemo(
    () => allProfiles.filter((p) => p.distanceKm <= 50),
    [allProfiles]
  );

  const visitorSectionData = useMemo(() => {
    if (!user || !visitors) return [];
    return visitors.filter((v) => v.gender !== user.gender);
  }, [visitors, user]);

  const displayedProfiles = activeTab === "all" ? allProfiles : nearbySectionUsers;

  function onProfilePress(profile: UserProfile | Visitor, isBlurred: boolean) {
    if (isBlurred && user?.gender !== "female") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    recordVisit(profile as UserProfile, user?.gender);
    router.push({
      pathname: "/profile/[id]",
      params: { id: profile.id, profileData: JSON.stringify(profile) },
    });
  }

  const ListHeader = () => (
    <View>
      {visitorSectionData.length > 0 && (
        <>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>My Visitors</Text>
          </View>
          <FlatList
            horizontal
            data={visitorSectionData}
            keyExtractor={(item) => `vis-${item.id}`}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
            renderItem={({ item, index }) => (
              <View style={{ width: 280 }}>
                <ProfileCardItem
                  profile={item}
                  isBlurred={index >= 2}
                  onPress={() => onProfilePress(item, index >= 2)}
                  myGender={user?.gender}
                />
              </View>
            )}
          />
        </>
      )}

      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tabItem, activeTab === "all" && styles.activeTabItem]}
          onPress={() => { Haptics.selectionAsync(); setActiveTab("all"); }}
        >
          <Text style={[styles.tabText, activeTab === "all" && styles.activeTabText]}>All</Text>
        </Pressable>
        <Pressable
          style={[styles.tabItem, activeTab === "nearby" && styles.activeTabItem]}
          onPress={() => { Haptics.selectionAsync(); setActiveTab("nearby"); }}
        >
          <Text style={[styles.tabText, activeTab === "nearby" && styles.activeTabText]}>Nearby</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <Pressable style={styles.headerIconBtn} onPress={() => setShowSettings(true)}>
          <Ionicons name="settings-outline" size={22} color={Colors.textSecondary} />
        </Pressable>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{t(lang, "discover")}</Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable style={styles.coinsChip} onPress={() => setShowSeedShop(true)}>
            <Text style={styles.seedEmoji}>🌻</Text>
            <Text style={styles.coinsText}>{user?.coins ?? 0}</Text>
          </Pressable>
          <Pressable style={styles.headerIconBtn} onPress={() => setShowEditProfile(true)}>
            <Ionicons name="person-circle-outline" size={24} color={Colors.textSecondary} />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.accent} />
          <Text style={styles.loadingText}>
            {lang === "ko" ? "유저 불러오는 중..." : "Loading users..."}
          </Text>
        </View>
      ) : loadError ? (
        // 에러 시 재시도 버튼
        <View style={styles.loadingContainer}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            {lang === "ko" ? "불러오기 실패" : "Failed to load"}
          </Text>
          <Pressable style={styles.retryBtn} onPress={loadRealUsers}>
            <Text style={styles.retryText}>
              {lang === "ko" ? "다시 시도" : "Retry"}
            </Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={displayedProfiles}
          keyExtractor={(item) => `main-${item.id}`}
          ListHeaderComponent={ListHeader}
          renderItem={({ item }) => (
            <View style={styles.verticalItemWrapper}>
              <ProfileCardItem
                profile={item}
                onPress={() => onProfilePress(item, false)}
                myGender={user?.gender}
              />
            </View>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Ionicons name="people-outline" size={48} color={Colors.textMuted} />
              <Text style={styles.emptyText}>
                {lang === "ko" ? "주변에 유저가 없어요" : "No users found"}
              </Text>
            </View>
          }
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          // 당겨서 새로고침
          onRefresh={loadRealUsers}
          refreshing={loading}
        />
      )}

      <AppSettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
      <ProfileEditModal visible={showEditProfile} onClose={() => setShowEditProfile(false)} />
      <CoinShopModal visible={showSeedShop} onClose={() => setShowSeedShop(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4, gap: 8,
  },
  headerIconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  coinsChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: Colors.backgroundCard, paddingHorizontal: 10,
    paddingVertical: 6, borderRadius: 16, borderWidth: 1,
    borderColor: "rgba(245,200,66,0.3)",
  },
  seedEmoji: { fontSize: 14 },
  coinsText: { fontWeight: "700", fontSize: 13, color: Colors.gold },
  sectionHeader: { paddingHorizontal: 16, marginTop: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 22, fontWeight: "900", color: Colors.textPrimary },
  horizontalList: { paddingHorizontal: 16, gap: 12, paddingBottom: 10 },
  tabBar: {
    flexDirection: "row", paddingHorizontal: 16,
    marginTop: 25, marginBottom: 15, gap: 15,
  },
  tabItem: { paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: "transparent" },
  activeTabItem: { borderBottomColor: Colors.accent },
  tabText: { fontSize: 18, fontWeight: "700", color: Colors.textMuted },
  activeTabText: { color: Colors.textPrimary },
  listContainer: { paddingBottom: 120 },
  verticalItemWrapper: { paddingHorizontal: 16, marginBottom: 10 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { color: Colors.textMuted, fontSize: 14 },
  emptyContainer: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText: { color: Colors.textMuted, fontSize: 16 },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: Colors.accent,
    borderRadius: 20,
  },
  retryText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  card: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: Colors.backgroundCard, borderRadius: 16,
    padding: 14, gap: 12, borderWidth: 1, borderColor: Colors.border,
  },
  cardAvatar: { position: "relative", width: 56, height: 56 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarGrad: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  onlineDot: {
    position: "absolute", bottom: 1, right: 1,
    width: 12, height: 12, borderRadius: 6,
    borderWidth: 2, borderColor: Colors.backgroundCard, zIndex: 10,
  },
  blurOverlay: {
    ...StyleSheet.absoluteFillObject, borderRadius: 28,
    overflow: "hidden", alignItems: "center", justifyContent: "center", zIndex: 5,
  },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  cardSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
});