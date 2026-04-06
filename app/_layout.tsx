import { useState, useEffect, useCallback, useRef } from "react";
import { Platform } from "react-native";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useFonts } from "expo-font";
import Ionicons from "@expo/vector-icons/Ionicons";
import * as Haptics from "expo-haptics";
import Purchases, { LOG_LEVEL } from "react-native-purchases";
import { getApp } from "@react-native-firebase/app";
import {
  getMessaging,
  onMessage,
  onNotificationOpenedApp,
  getInitialNotification,
  getToken,
  onTokenRefresh,
} from "@react-native-firebase/messaging";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

import { IncomingCallModal } from "../components/IncomingCallModal";
import MatchSearchingBanner from "../components/MatchSearchingBanner";
import MatchFoundModal from "../components/MatchFoundModal";
import { AuthProvider, useAuth } from "../contexts/AuthContext";
import { DataProvider, useData, UserProfile } from "../contexts/DataContext";
import { MatchProvider } from "../contexts/MatchContext";
import { db } from "../constants/firebase";

SplashScreen.preventAutoHideAsync();

type IncomingCallPayload = {
  callerId: string;
  callerName: string;
  convoId: string;
  callerPhoto?: string;
  callerToken?: string;
  callType?: "random" | "paid" | "friend";
};

function RootNavigator() {
  const [incomingCall, setIncomingCall] = useState<IncomingCallPayload | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [isRevenueCatReady, setIsRevenueCatReady] = useState(false);

  const { user } = useAuth();
  const { conversations, addConversation, refreshConversations } = useData();

  const revenueCatConfiguredRef = useRef(false);
  const syncedRevenueCatUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const initRevenueCat = async () => {
      try {
        if (Platform.OS !== "android") {
          console.log("[RevenueCat] iOS key not set yet");
          return;
        }

        if (revenueCatConfiguredRef.current) {
          setIsRevenueCatReady(true);
          return;
        }

        Purchases.setLogLevel(LOG_LEVEL.DEBUG);

        await Purchases.configure({
          apiKey: "goog_IbTRjDminCeiSSYLjYibUiORwoL",
        });

        revenueCatConfiguredRef.current = true;
        setIsRevenueCatReady(true);
        console.log("[RevenueCat] Android configured");
      } catch (e) {
        console.log("[RevenueCat] configure error:", e);
        setIsRevenueCatReady(false);
      }
    };

    initRevenueCat();
  }, []);

  useEffect(() => {
    const syncRevenueCatUser = async () => {
      try {
        if (Platform.OS !== "android") return;
        if (!isRevenueCatReady) return;

        const nextUserId = user?.id ?? null;

        if (!nextUserId) {
          if (syncedRevenueCatUserIdRef.current !== null) {
            await Purchases.logOut();
            syncedRevenueCatUserIdRef.current = null;
            console.log("[RevenueCat] logged out");
          }
          return;
        }

        if (syncedRevenueCatUserIdRef.current === nextUserId) return;

        await Purchases.logIn(nextUserId);
        syncedRevenueCatUserIdRef.current = nextUserId;
        console.log("[RevenueCat] logged in:", nextUserId);
      } catch (e) {
        console.log("[RevenueCat] user sync error:", e);
      }
    };

    syncRevenueCatUser();
  }, [isRevenueCatReady, user?.id]);

  useEffect(() => {
    const app = getApp();
    const firebaseMessaging = getMessaging(app);

    const unsubscribe = onMessage(firebaseMessaging, async (remoteMessage) => {
      console.log("📞 [포그라운드 FCM 수신]:", remoteMessage.data);

      const rawData = remoteMessage.data as Record<string, unknown> | undefined;

      const callerId =
        typeof rawData?.callerId === "string" ? rawData.callerId : "";
      const callerName =
        typeof rawData?.callerName === "string" ? rawData.callerName : "상대방";
      const convoId =
        typeof rawData?.convoId === "string" ? rawData.convoId : "";
      const callerPhoto =
        typeof rawData?.callerPhoto === "string" ? rawData.callerPhoto : "";
      const callerToken =
        typeof rawData?.callerToken === "string" ? rawData.callerToken : "";
      const rawCallType =
        typeof rawData?.callType === "string" ? rawData.callType : undefined;
      const type =
        typeof rawData?.type === "string" ? rawData.type : undefined;

      if (type === "VOICE_CALL" && callerId && convoId) {
        setIncomingCall({
          callerId,
          callerName,
          convoId,
          callerPhoto,
          callerToken,
          callType:
            rawCallType === "random" ||
            rawCallType === "paid" ||
            rawCallType === "friend"
              ? rawCallType
              : undefined,
        });
      }
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const app = getApp();
    const firebaseMessaging = getMessaging(app);

    const moveFromNotification = (remoteMessage: any) => {
      const rawData = remoteMessage?.data as Record<string, unknown> | undefined;
      if (!rawData) return;

      const type = typeof rawData.type === "string" ? rawData.type : "";
      const convoId = typeof rawData.convoId === "string" ? rawData.convoId : "";
      const callerName =
        typeof rawData.callerName === "string" ? rawData.callerName : "상대방";
      const callerId =
        typeof rawData.callerId === "string" ? rawData.callerId : "";
      const callerToken =
        typeof rawData.callerToken === "string" ? rawData.callerToken : "";
      const senderName =
        typeof rawData.senderName === "string" ? rawData.senderName : "상대방";
      const rawCallType =
        typeof rawData.callType === "string" ? rawData.callType : undefined;

      if (type === "VOICE_CALL" && convoId) {
        router.push({
          pathname: "/matching/calling",
          params: {
            convoId,
            profileName: callerName,
            targetToken: callerToken,
            isReceiver: "true",
            callerId,
            callType:
              rawCallType === "random" ||
              rawCallType === "paid" ||
              rawCallType === "friend"
                ? rawCallType
                : "random",
          },
        });
        return;
      }

      if (type === "CHAT_MESSAGE" && convoId) {
        router.push({
          pathname: "/(tabs)/chat",
          params: {
            convoId,
            senderName,
          },
        } as any);
      }
    };

    const unsubscribe = onNotificationOpenedApp(firebaseMessaging, (remoteMessage) => {
      console.log("📲 [알림 탭 - background]:", remoteMessage?.data);
      moveFromNotification(remoteMessage);
    });

    getInitialNotification(firebaseMessaging)
      .then((remoteMessage) => {
        if (remoteMessage) {
          console.log("🚀 [알림 탭 - quit]:", remoteMessage?.data);
          moveFromNotification(remoteMessage);
        }
      })
      .catch((e) => {
        console.log("getInitialNotification error:", e);
      });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const app = getApp();
    const firebaseMessaging = getMessaging(app);

    if (!user?.id) return;

    let isMounted = true;

    const saveFcmToken = async (token: string) => {
      if (!token || !isMounted) return;

      try {
        await setDoc(
          doc(db, "users", user.id),
          {
            fcmToken: token,
            fcmTokenUpdatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        console.log("[FCM] token saved");
      } catch (e) {
        console.log("[FCM] token save error:", e);
      }
    };

    const syncCurrentToken = async () => {
      try {
        const token = await getToken(firebaseMessaging);
        if (token) {
          await saveFcmToken(token);
        }
      } catch (e) {
        console.log("[FCM] getToken error:", e);
      }
    };

    syncCurrentToken();

    const unsubscribe = onTokenRefresh(firebaseMessaging, async (token) => {
      console.log("[FCM] token refreshed:", token);
      await saveFcmToken(token);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [user?.id]);

  useEffect(() => {
    if (!incomingCall) return;

    const interval = setInterval(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }, 1500);

    return () => clearInterval(interval);
  }, [incomingCall]);

  const buildCallerProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (!incomingCall?.callerId) return null;

    try {
      const snap = await getDoc(doc(db, "users", incomingCall.callerId));

      if (snap.exists()) {
        const data = snap.data();

        return {
          id: incomingCall.callerId,
          nickname: data.nickname || incomingCall.callerName || "상대방",
          gender: data.gender || "male",
          age: Number(data.age ?? 25),
          language: data.language || "ko",
          location: data.location || "",
          distanceKm: Number(data.distanceKm ?? 0),
          profilePhoto: data.profilePhoto || incomingCall.callerPhoto || "",
          voiceIntroUrl: data.voiceIntroUrl || "",
          isOnline: Boolean(data.isOnline),
          fcmToken: data.fcmToken || data.TargetToken || incomingCall.callerToken || "",
        };
      }
    } catch (e) {
      console.log("caller profile fetch error:", e);
    }

    return {
      id: incomingCall.callerId,
      nickname: incomingCall.callerName || "상대방",
      gender: "male",
      age: 25,
      language: "ko",
      location: "",
      distanceKm: 0,
      profilePhoto: incomingCall.callerPhoto || "",
      voiceIntroUrl: "",
      isOnline: true,
      fcmToken: incomingCall.callerToken || "",
    };
  }, [incomingCall]);

  const handleAccept = useCallback(async () => {
    if (!incomingCall || !user?.id || accepting) return;

    try {
      setAccepting(true);

      const callerProfile = await buildCallerProfile();
      if (!callerProfile) return;

      const existingConvo = conversations.find(
        (c) =>
          c.id === incomingCall.convoId ||
          c.matchedUserId === incomingCall.callerId
      );

      const resolvedCallType: "random" | "paid" | "friend" =
        incomingCall.callType === "random" ||
        incomingCall.callType === "paid" ||
        incomingCall.callType === "friend"
          ? incomingCall.callType
          : existingConvo?.isFriend
          ? "friend"
          : "random";

      const shouldBeFriend =
        resolvedCallType === "paid" || resolvedCallType === "friend";

      const ensuredConversation = await addConversation(callerProfile, {
        messageUnlocked: true,
        voiceUnlocked:
          resolvedCallType === "paid"
            ? true
            : (existingConvo?.isVoiceUnlocked ?? false),
        isFriend: shouldBeFriend || existingConvo?.isFriend === true,
        friendSource:
          resolvedCallType === "paid"
            ? "paid"
            : existingConvo?.friendSource || undefined,
      });

      await refreshConversations();

      const nextConvoId = incomingCall.convoId || ensuredConversation.id;
      const isAlreadyFriend =
        shouldBeFriend || ensuredConversation.isFriend === true;

      setIncomingCall(null);

      router.push({
        pathname: "/matching/calling",
        params: {
          convoId: nextConvoId,
          profileName: callerProfile.nickname ?? "상대방",
          targetToken: callerProfile.fcmToken || incomingCall.callerToken || "",
          isReceiver: "true",
          isAlreadyFriend: isAlreadyFriend ? "true" : "false",
          callType: resolvedCallType,
        },
      });
    } catch (e) {
      console.log("수락 처리 실패:", e);
    } finally {
      setAccepting(false);
    }
  }, [
    incomingCall,
    user?.id,
    accepting,
    buildCallerProfile,
    conversations,
    addConversation,
    refreshConversations,
  ]);

  const handleReject = useCallback(() => {
    if (accepting) return;
    setIncomingCall(null);
  }, [accepting]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="matching/calling" />
      </Stack>

      <MatchSearchingBanner />
      <MatchFoundModal />

      {incomingCall && (
        <IncomingCallModal
          callerName={incomingCall.callerName}
          callerId={incomingCall.callerId}
          convoId={incomingCall.convoId}
          callerPhoto={incomingCall.callerPhoto}
          callerToken={incomingCall.callerToken || ""}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    ...Ionicons.font,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AuthProvider>
      <DataProvider>
        <MatchProvider>
          <RootNavigator />
        </MatchProvider>
      </DataProvider>
    </AuthProvider>
  );
}