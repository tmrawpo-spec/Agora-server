import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * 핸드폰의 알림 권한을 요청하고, FCM 전용 디바이스 토큰을 가져오는 함수입니다.
 * 서버(index.ts)의 Firebase Admin SDK와 통신하기 위해 필수적인 설정입니다.
 */
export async function registerForPushNotificationsAsync() {
  let token;

  // 1. 실제 기기인지 확인 (푸시 알림은 실제 기기에서만 작동합니다)
  if (!Device.isDevice) {
    console.log("⚠️ 알림: 푸시 알림 테스트는 실제 기기에서 진행해야 합니다.");
    return null;
  }

  // 2. 현재 알림 권한 상태 확인
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // 3. 권한이 없다면 사용자에게 요청 팝업을 띄웁니다
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  // 4. 권한 거절 시 중단
  if (finalStatus !== "granted") {
    console.log("❌ 알림 권한 획득 실패!");
    return null;
  }

  // 5. [핵심] 순수 FCM용 디바이스 토큰 가져오기
  try {
    // 서버의 admin.messaging()은 Expo 토큰이 아닌 이 Device 토큰을 사용해야 합니다.
    const deviceTokenData = await Notifications.getDevicePushTokenAsync();
    token = deviceTokenData.data;

    console.log("✅ 나의 FCM 디바이스 토큰:", token);
  } catch (e) {
    console.error("❌ 토큰을 가져오는 중 에러 발생:", e);
  }

  // 6. 안드로이드 채널 설정 (서버 index.ts의 channelId와 일치시켜야 함)
  if (Platform.OS === "android") {
    // 기본 알림 채널
    await Notifications.setNotificationChannelAsync("default", {
      name: "일반 알림",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
      sound: "default",
    });

    // ✅ [수정] 서버 코드 index.ts의 channelId: "call_channel"과 정확히 일치시킴
    await Notifications.setNotificationChannelAsync("call_channel", {
      name: "전화 수신 알림",
      importance: Notifications.AndroidImportance.MAX, // 팝업(헤드업) 노출을 위해 필수
      vibrationPattern: [0, 500, 500, 500], // 전화 느낌의 진동 패턴
      lightColor: "#FF0000",
      sound: "default", 
      showBadge: true,
    });
  }

  return token;
}