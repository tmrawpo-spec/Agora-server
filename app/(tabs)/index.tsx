import React, { useState, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Platform,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { useAuth, Gender } from "@/contexts/AuthContext";
import { useData, FakeProfile, Visitor } from "@/contexts/DataContext";
import { Colors } from "@/constants/colors";
import { t, Language } from "@/constants/i18n";
import { generateFakeProfiles } from "@/constants/fakeProfiles";
import { AppSettingsModal } from "@/components/AppSettingsModal";
import { ProfileEditModal } from "@/components/ProfileEditModal";
import { CoinShopModal } from "@/components/CoinShopModal";

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

// ✅ 버튼(문자, 전화)이 제거된 깔끔한 카드 컴포넌트
function ProfileCardItem({
  profile,
  onPress,
  isBlurred = false,
  myGender,
}: {
  profile: FakeProfile | Visitor;
  onPress: () => void;
  isBlurred?: boolean;
  myGender?: Gender;
}) {
  const isFemale = myGender === "female";
  const finalBlurred = isFemale ? false : isBlurred;

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

      {/* ✅ 오른쪽 화살표 아이콘으로 상세 이동 유도 */}
      <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
    </Pressable>
  );
}

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { visitors, recordVisit } = useData();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const lang = useMemo(() => (user?.language || "ko") as Language, [user?.language]);

  const [allProfiles, setAllProfiles] = useState<FakeProfile[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>("all");
  const [showSettings, setShowSettings] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [showCoinShop, setShowCoinShop] = useState(false);

  useEffect(() => {
    if (user?.gender) {
      const oppositeGender: Gender = user.gender === "male" ? "female" : "male";
      const newProfiles = generateFakeProfiles(oppositeGender, lang, 50);
      setAllProfiles(newProfiles);
    }
  }, [user?.gender, lang]);

  const nearbySectionUsers = useMemo(() => allProfiles.filter(p => p.distanceKm <= 50), [allProfiles]);
  const allSectionUsers = useMemo(() => allProfiles.filter(p => p.distanceKm <= 600), [allProfiles]);
  const visitorSectionData = useMemo(() => {
    if (!user || !visitors) return [];
    return visitors.filter(v => v.gender !== user.gender);
  }, [visitors, user]);

  const displayedProfiles = activeTab === "all" ? allSectionUsers : nearbySectionUsers;

  const onProfilePress = (profile: FakeProfile | Visitor, isBlurred: boolean) => {
    if (isBlurred && user?.gender !== "female") {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    recordVisit(profile as FakeProfile, user?.gender);
    router.push({ 
      pathname: "/profile/[id]", 
      params: { id: profile.id, profileData: JSON.stringify(profile) } 
    });
  };

  const ListHeader = () => (
    <View>
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

      <View style={styles.tabBar}>
        <Pressable 
          style={[styles.tabItem, activeTab === "all" && styles.activeTabItem]} 
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab("all");
          }}
        >
          <Text style={[styles.tabText, activeTab === "all" && styles.activeTabText]}>All</Text>
        </Pressable>
        <Pressable 
          style={[styles.tabItem, activeTab === "nearby" && styles.activeTabItem]} 
          onPress={() => {
            Haptics.selectionAsync();
            setActiveTab("nearby");
          }}
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
          <Pressable style={styles.coinsChip} onPress={() => setShowCoinShop(true)}>
            <Ionicons name="star" size={14} color={Colors.gold} />
            <Text style={styles.coinsText}>{user?.coins ?? 0}</Text>
          </Pressable>
          <Pressable style={styles.headerIconBtn} onPress={() => setShowEditProfile(true)}>
            <Ionicons name="person-circle-outline" size={24} color={Colors.textSecondary} />
          </Pressable>
        </View>
      </View>

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
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
      />

      <AppSettingsModal visible={showSettings} onClose={() => setShowSettings(false)} />
      <ProfileEditModal visible={showEditProfile} onClose={() => setShowEditProfile(false)} />
      <CoinShopModal visible={showCoinShop} onClose={() => setShowCoinShop(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 12, paddingTop: 4, gap: 8 },
  headerIconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 4 },
  coinsChip: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: Colors.backgroundCard, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: "rgba(245,200,66,0.3)" },
  coinsText: { fontWeight: "700", fontSize: 13, color: Colors.gold },
  sectionHeader: { paddingHorizontal: 16, marginTop: 20, marginBottom: 12 },
  sectionTitle: { fontSize: 22, fontWeight: "900", color: Colors.textPrimary },
  horizontalList: { paddingHorizontal: 16, gap: 12, paddingBottom: 10 },
  tabBar: { flexDirection: "row", paddingHorizontal: 16, marginTop: 25, marginBottom: 15, gap: 15 },
  tabItem: { paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: "transparent" },
  activeTabItem: { borderBottomColor: Colors.accent },
  tabText: { fontSize: 18, fontWeight: "700", color: Colors.textMuted },
  activeTabText: { color: Colors.textPrimary },
  listContainer: { paddingBottom: 120 },
  verticalItemWrapper: { paddingHorizontal: 16, marginBottom: 10 },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.backgroundCard, borderRadius: 16, padding: 14, gap: 12, borderWidth: 1, borderColor: Colors.border },
  cardAvatar: { position: "relative", width: 56, height: 56 },
  avatar: { width: 56, height: 56, borderRadius: 28 },
  avatarGrad: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  onlineDot: { position: "absolute", bottom: 1, right: 1, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: Colors.backgroundCard, zIndex: 10 },
  blurOverlay: { ...StyleSheet.absoluteFillObject, borderRadius: 28, overflow: "hidden", alignItems: "center", justifyContent: "center", zIndex: 5 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: "700", color: Colors.textPrimary },
  cardSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
});
