import { useState, useEffect } from "react";
import { Stack, router } from "expo-router";
import * as Haptics from "expo-haptics";
import messaging from "@react-native-firebase/messaging";

import { IncomingCallModal } from "../components/IncomingCallModal";
import { AuthProvider } from "../contexts/AuthContext";
import { DataProvider } from "../contexts/DataContext";

export default function RootLayout() {
  const [incomingCall, setIncomingCall] = useState<any>(null);

  // 🔥 앱이 켜져 있을 때 FCM 수신
  useEffect(() => {
    const unsubscribe = messaging().onMessage(async (remoteMessage) => {
      console.log("📞 [포그라운드 FCM 수신]:", remoteMessage.data);

      const data = remoteMessage.data;

      if (data?.type === "VOICE_CALL") {
        setIncomingCall({
          callerId: data.callerId,
          callerName: data.callerName || "상대방",
          convoId: data.convoId,
          callerPhoto: data.callerPhoto,
        });
      }
    });

    return unsubscribe;
  }, []);

  // 🔥 앱이 백그라운드/종료 상태일 때 FCM 수신
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    console.log("📩 [백그라운드 FCM 수신]:", remoteMessage.data);

    const data = remoteMessage.data;

    if (data?.type === "VOICE_CALL") {
      setIncomingCall({
        callerId: data.callerId,
        callerName: data.callerName || "상대방",
        convoId: data.convoId,
        callerPhoto: data.callerPhoto,
      });
    }
  });

  // 🔔 진동 반복
  useEffect(() => {
    if (incomingCall) {
      const interval = setInterval(() => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }, 1500);
      return () => clearInterval(interval);
    }
  }, [incomingCall]);

  return (
    <AuthProvider>
      <DataProvider>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="matching/calling" />
        </Stack>

        {/* 📞 수신 전화 모달 */}
        {incomingCall && (
          <IncomingCallModal
            callerName={incomingCall.callerName}
            callerId={incomingCall.callerId}
            convoId={incomingCall.convoId}
            callerPhoto={incomingCall.callerPhoto}
            onAccept={(callerToken) => {
              console.log("🚀 [수락] 상대 토큰:", callerToken);

              const targetId = incomingCall.convoId;
              const targetName = incomingCall.callerName;

              setIncomingCall(null);

              router.push({
                pathname: "/matching/calling",
                params: {
                  convoId: targetId,
                  profileName: targetName,
                  targetToken: callerToken,
                  isReceiver: "true",
                },
              });
            }}
            onReject={() => setIncomingCall(null)}
          />
        )}
      </DataProvider>
    </AuthProvider>
  );
}