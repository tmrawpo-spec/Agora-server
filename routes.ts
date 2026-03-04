import type { Express } from "express";
import { createServer, type Server } from "node:http";
import { Expo, ExpoPushMessage } from "expo-server-sdk";

const expo = new Expo();

export async function registerRoutes(app: Express): Promise<Server> {
  
  // ✅ 상대방에게 전화 알림을 보내는 API
  app.post("/send-call-notification", async (req, res) => {
    const { targetToken, callerName, convoId } = req.body;

    console.log(`🔔 알림 요청 수신: To(${targetToken}), From(${callerName})`);

    if (!targetToken || !Expo.isExpoPushToken(targetToken)) {
      return res.status(400).json({ success: false, error: "Invalid or missing token" });
    }

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

    try {
      let chunks = expo.chunkPushNotifications(messages);
      for (let chunk of chunks) {
        await expo.sendPushNotificationsAsync(chunk);
      }
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to send notification" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
