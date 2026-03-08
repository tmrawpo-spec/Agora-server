import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { Expo, ExpoPushMessage } from "expo-server-sdk"; // 👈 ExpoPushMessage 타입 추가

// Expo 객체 초기화
const expo = new Expo();

export async function registerRoutes(app: Express): Promise<Server> {

  // ✅ [추가] 상대방에게 전화 알림을 보내는 API
  app.post("/send-call-notification", async (req, res) => {
    const { targetToken, callerName, convoId } = req.body;

    console.log(`🔔 알림 요청 수신: To(${targetToken}), From(${callerName})`);

    // 1. 토큰 유효성 검사
    if (!targetToken || typeof targetToken !== 'string' || targetToken.length < 10) {
  console.error("❌ 유효하지 않은 FCM 토큰입니다. (받은 토큰 없음 또는 형식 오류)");
  return res.status(400).json({ 
    success: false, 
    error: "Invalid or missing FCM token" 
  });
}

    // 2. 메시지 구성 (타입을 ExpoPushMessage[]로 명시하여 빨간 줄 해결)
    const messages: ExpoPushMessage[] = [{
      to: targetToken,
      sound: "default",
      title: "📞 통화 요청",
      body: `${callerName}님이 통화를 원합니다.`,
      data: { 
        convoId: convoId, 
        callerName: callerName,
        type: "VOICE_CALL" 
      },
      priority: "high",
    }];

    // 3. 전송 시도
    try {
      // 이제 여기서 타입 충돌이 일어나지 않습니다.
      let chunks = expo.chunkPushNotifications(messages);
      for (let chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      console.log("🚀 푸시 알림 전송 완료");
      res.json({ success: true });
    } catch (error) {
      console.error("❌ 푸시 전송 중 에러 발생:", error);
      res.status(500).json({ success: false, error: "Failed to send notification" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}