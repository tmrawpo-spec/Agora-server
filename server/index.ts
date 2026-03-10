import pkg from "agora-token";
const { RtcTokenBuilder, RtcRole } = pkg;

import express from "express";
import type { Request, Response } from "express";
import cors from "cors";

import admin from "firebase-admin";
import { getApps, initializeApp, cert } from "firebase-admin/app";

// Firebase 서비스 계정
const serviceAccount = {
    type: "service_account",
    project_id: "nighton-f6605",
    private_key_id: "45c44cfce7b24c8278419520745e2ced92dc8eb5",
    private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQCwrmy451kMV90L\nvZJkX2jy3fzXmxU1MZNx7f3Q95Gc8LrqiHz4AefqEblRIen8jZZbujo9ZD1INH78\nRqAqF4pFR2SCftMWR3PegwjdO2Er7q4+XOyKoVKrUzfY38m4FnJFguFVj2X3M49k\nYJW0p37ulC5mxoWaINbmKoNKFSHKQ8NoJv9fSsvxVzzSSQD1hPV/2WsGeSbEkLcp\n7VIVjecCMKeupPYLLvwQS+99FS9VbuG0BByNI2gr22anaeD/+gdUZGp4Mu8Vojqv\n81g8PGzKKxpJ2ucUDtT8nBOrXoBquOyIM87KtTDdWbRxTH9hPkMUVgxpdX3R33Ch\nVPzT5r1bAgMBAAECggEAKhb7bpcqdw7NaXkZUVELYuQwUjqvNDNhwT/lee0oYr9U\nf//Q6ZImqfPb9nCCWfhu694y9qIVGUjsQXQfvrdJ6NQnpRDKf6G5ADauG2oEbZ9Y\nIiIn9aSV2ZujD8bMOs8aHOYfgS7+pwPA8rQxpc5LJlHltfUwKbYOC9nv2eur14+k\nqX/B67gQPbzbcp/uds4nkfTpTiZBcyq2nMvZe9SBhCiqk5ikr6PDM1SmO/wZY3eQ\nQ5Text+1ecyjH/7c4AMalRrBOnJ2Fu46SveQVeAoBrxN3GxvQPpgtZQLrkYCFrSl\n/e7kUaWTckq/TTn/L63P3ghLad2WKKKwDcx7c/WzCQKBgQDdadWTV0kUPEEU9+wW\n0pIFsp0yniITxcoqnTHkXtxgb8o+QlHYMHkCUIg6J6wWVt2W5A+tRgpaCTJCvKpX\nH+LcOwcfl3qgtTHuibW53GMHMn47kmLQ4kqY0cmRVJtcus5nX+rpJmiFqoywh6GN\n3Pd4p06VZ11QCrFXNZMOfYpTgwKBgQDMR8lidsT91TkpFUNsf3e/SfwcjEHMHJuC\nnOiU5loS/GNVX5ScOwD2VCkuSwBH+JdyEIyPrsCi356GP5IYmREVXpZoCWobkm+8\nfbSM2M18ZxO2DE+mA9PupHXLq3d4DhbMHVM/aD0S1JRvfIo/vpWvSHPmX/F/ZBx4\nI5wQ4PrPSQKBgQC+ACcN5FZK7hXvV30abKJwD0GEgVy+2PlOrkx1K84zV1sXKDQx\nsA73pIHyXb74AJzw8k5dpAAYGVIvINWQJEW6NVE8k/HgXP03NKdkkjHMqFDY8Bqq\nI7ZeA5DUjOUxowCihxX/8zy4j41ho1JIeblHqVLvNJ9Ho5VhQBEs2yBL3wKBgQC7\ncgOwfhs0b7sLn59Gp5BRzqmv6GNXz8hCiYhBWT29vinH5PSQhvPTFFbVS6zuXYVZ\n/SV9knTg/yCPPzXnrEyotyp8PGdI9Y3h/9b0htvHEy5bFeDgDRMjH3WXdbciSotQ\nsHf67sNbzASIaFbTNyZSuMDg25jVtB8LfmFue4KpQQKBgG2RMnhtG+g8sY382cDu\n0zWATcU+kGca7iNxK69AYbjDr4IMqyiFFruRp1L5Ct8G5pWN6ayG9VDBsvoxeTpf\n498rsfVRlrE+xgQJBddtzKZ/TeWqfmpRIFrcdfUQ8CtQSwrvrA40jzZ+bsh+JG1z\nhAh8qjJWXzeeUsLEa+QGiTZV\n-----END PRIVATE KEY-----\n".replace(/\\n/g, '\n'),
    client_email: "firebase-adminsdk-fbsvc@nighton-f6605.iam.gserviceaccount.com",
    client_id: "113031335639973632043",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
    auth_provider_x509_cert_url: "https://www.googleapis.com/robot/v1/metadata/x509/firebase-adminsdk-fbsvc%40nighton-f6605.iam.gserviceaccount.com",
    client_x509_cert_url: "..."
};

// Firebase 초기화
if (getApps().length === 0) {
    initializeApp({
        credential: cert(serviceAccount as any),
    });
    console.log("🔥 Firebase Admin Initialized");
}

const app = express();
app.use(cors());
app.use(express.json());

const APP_ID = "94e90b1837c04de4b4a21aa6caaf8f03";
const APP_CERTIFICATE = "5857791ccd0a4964b76504694725b88b";

// Agora 토큰 생성
app.get("/rtc-token", (req: Request, res: Response) => {
    const channelName = req.query.channelName as string;
    const uid = Number(req.query.uid);

if (!channelName) return res.status(400).json({ error: "channelName is required" });
if (isNaN(uid)) {
  return res.status(400).json({ error: "uid must be a valid number" });
}

    const role = RtcRole.PUBLISHER;
    const expiration = Math.floor(Date.now() / 1000) + 3600;

    try {
        const token = RtcTokenBuilder.buildTokenWithUid(
            APP_ID,
            APP_CERTIFICATE,
            channelName,
            uid,
            role,
            expiration,
            expiration
        );
        return res.json({ token });
    } catch (e) {
        return res.status(500).json({ error: "Failed to generate token" });
    }
});

// 📞 통화 알림 (data-only)
app.post("/send-call-notification", async (req: Request, res: Response) => {
    const { targetToken, callerName, callerId, convoId, callerToken } = req.body;

    if (!targetToken) {
        return res.status(400).json({ error: "targetToken is required" });
    }

    const message: admin.messaging.Message = {
  token: targetToken,
  notification: {
    title: callerName,
    body: "전화가 왔습니다",
  },
  data: {
    type: "VOICE_CALL",
    callerName: String(callerName),
    callerId: String(callerId || ""),
    convoId: String(convoId),
    callerToken: String(callerToken || ""),
  },
  android: {
    priority: "high",
    notification: {
      channelId: "default",
      sound: "default",
    },
  },
  apns: {
    payload: {
      aps: {
        alert: {
          title: callerName,
          body: "전화가 왔습니다",
        },
        sound: "default",
      },
    },
  },
};

    try {
        const response = await admin.messaging().send(message);
        res.json({ success: true, messageId: response });
    } catch (error: any) {
        res.status(500).json({ error: "FCM Send Failed", details: error.message });
    }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));