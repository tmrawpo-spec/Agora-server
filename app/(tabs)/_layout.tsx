import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { NativeTabs, Icon, Label, Badge } from "expo-router/unstable-native-tabs";
import { BlurView } from "expo-blur";
import { Platform, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { useAuth } from "@/contexts/AuthContext";
import { useData } from "@/contexts/DataContext";
import { t, Language } from "@/constants/i18n";

type BadgeValue = string | number | undefined;

function getUnreadBadgeValue(totalUnread: number): BadgeValue {
  if (!totalUnread || totalUnread <= 0) return undefined;
  if (totalUnread > 99) return "99+";
  return totalUnread;
}

// --- NativeTabLayout (iOS용 특수 탭) ---
function NativeTabLayout({
  lang,
  unreadBadge,
}: {
  lang: Language;
  unreadBadge?: string;
}) {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "person.2", selected: "person.2.fill" }} />
        <Label>{t(lang, "discover")}</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="match">
        <Icon sf={{ default: "moon.stars", selected: "moon.stars.fill" }} />
        <Label>{t(lang, "match")}</Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="friends">
        <Icon
          sf={{
            default: "bubble.left.and.bubble.right",
            selected: "bubble.left.and.bubble.right.fill",
          }}
        />
        <Label>{t(lang, "chat")}</Label>
        {unreadBadge ? <Badge>{unreadBadge}</Badge> : null}
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="board">
        <Icon sf={{ default: "square.grid.2x2", selected: "square.grid.2x2.fill" }} />
        <Label>{t(lang, "board")}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

// --- ClassicTabLayout (Android / Web / 일반 iOS용) ---
function ClassicTabLayout({
  lang,
  unreadBadge,
}: {
  lang: Language;
  unreadBadge?: string | number;
}) {
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarBadgeStyle: {
          backgroundColor: "#ff3b30",
          color: "#ffffff",
          fontSize: 11,
          fontWeight: "700",
          minWidth: 18,
          height: 18,
          lineHeight: 18,
        },
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : Colors.backgroundElevated,
          borderTopWidth: isWeb ? 1 : 0,
          borderTopColor: Colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint="dark" style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: Colors.backgroundElevated },
              ]}
            />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t(lang, "discover"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="match"
        options={{
          title: t(lang, "match"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="moon" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="friends"
        options={{
          title: t(lang, "chat"),
          tabBarBadge: unreadBadge,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="chatbubbles" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="board"
        options={{
          title: t(lang, "board"),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}

// --- 메인 TabLayout ---
export default function TabLayout() {
  const { user } = useAuth();
  const { conversations } = useData();

  const lang = (user?.language || "en") as Language;

  const totalUnread = conversations.reduce(
    (sum, convo) => sum + Number(convo.unreadCount ?? 0),
    0
  );

  const unreadBadgeValue = getUnreadBadgeValue(totalUnread);
  const nativeUnreadBadgeText =
    unreadBadgeValue === undefined ? undefined : String(unreadBadgeValue);

  if (isLiquidGlassAvailable()) {
    return (
      <NativeTabLayout
        lang={lang}
        unreadBadge={nativeUnreadBadgeText}
      />
    );
  }

  return (
    <ClassicTabLayout
      lang={lang}
      unreadBadge={unreadBadgeValue}
    />
  );
}