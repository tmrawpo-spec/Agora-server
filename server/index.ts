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
    private_key_id: "ed3847ae7e8b8c000fe85ac9bcc689a514fbc7bb",
    private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCmHi6OeJGOVAvX\nR4aeVy899ZNbR4km0N34lsVG8szIemAl4hFwdFMe7AAPP2uZ9kw8ODw1VDV0LuDB\nmZDsUp1eWxqBIOo5sPRCmqQtgOkMprmHfJi0B/0QVLQ0L9bRjwy+BCb5b8ApEy5R\nB/6rsob6mQUawgf2y9dq67hr2EXzoOvXx/g/UQ72vTPMAd/0z/TuIZtCH0v4XYeO\nrgQZds0OQOBkocCKWRJDwX2fX6jHfctgZchR1Y6CVUrGSS1yQqAFNMNc9Ebi22Rf\nRpo0w3sCq7Gxoaa3lN9YNtBtRX3bJ/cMEj9mGzjcv5IoSQju3npSAdeG2kpV7fGF\nTNmScVw/AgMBAAECggEAImExunu6iC3dy366ni+mD9kw153dBUMKBYZSquXaOw2U\ns5JvkIoKn+Yw9vblspYWXgo3b8QPUg3Xp0m8hCRu/FW3jQz+XNVCIDy4CNDaqqsg\nz6kaQ3w5xDT7nKdf+rvz46mhVVNq/jVBizSv4OIQbHHZ7BlHI605VqAVaYB3rb2F\nW4Wwqij20URc7YLuKkBZjWhVhuI+UJRN8dFgQiPLYnvqgDy20D0tX18RR5H7/+QF\ncLT6AXa5jTZ5d+hiN90CVWRifi7SUpB7BYcKxGtwz6tkWa3VGud/yN9NJJOOZoEj\nqgLRYAHxfXUJntx4L9mNB1RX1JRB3FtSOLKSRPU5KQKBgQDUubgUb41jU1btjlhL\n6dMhp1l5Jt1CuYoE1lRplV+pfkmgOhapp3kpKgVjEl2nQlC4xkhlwxGt8mwaRHBx\nXdBCMN+NcoVEDjjhv4WE0759oSMp//c3BAA4w4U8FsPpYJlUy+umX7f/tZiif+QY\nRlG2UoDvBbSOVZlRBpkPJ9u6CQKBgQDH6T3kZkYqwGVzHdpHoJpcxSMbqCYNJ90P\nfaxudpz8F1g8ZdxewCV1tlguUaS/TXCxT4thNZSMxXmv00Nhgec9vsPVmXnwaVuP\ngWmr7fyiMp4hlVUI46uNC+bB1iEwohag6F4GIWZk57mRd9ROaO4QeBVtGNs/oLEP\n0IQwzH6WBwKBgGTgJSDbvWqKjMBeLhThrxNYbp97BJWtsnuUv7bJ9PFFR9jJcxHE\nrzoMCT3v6aV1Vx4oORC4rluUiBr0tXWtDSM2VeyXkAazz9mGnt1cJAsjLK+wCCV4\nqjpAzZ+vE/xJqKyDfx4IahLCpLz6dMnmHr2c5jNyuyp8ARZhUJfVSOcxAoGBALz/\nNuNjCb1LTd5Kf94t6SIBwpJYIzlW0bjegJGilAIE9AeN6Yyurfuem7mWuGGgDgWk\nBUqvBDUeUVA4NEDQNlV6r9yWD+GJSeXfXI8OHUUfA78OVmlkDQD5Gn1xOsmmxCv1\n40Z6dzq4lQkBN/e1XjS1wtP0pvt9qUghQ4h7HMYrAoGAEXQO2PJ2MojjD0C4acfv\nrDdQaywIHxOOm0Pgp7XOD4XuTeaIjQ34nD4HoQAPbfkI5s/9uLBvzFEN4LKsZ05X\nSIEBdpyKXmoyYk/i1lHnxKWTsX/1jK5blzXEtdkG3aCmtkgGyExPs7HpP/YJbLMI\nNvWNeChoDLmdK5/490UmsVY=\n-----END PRIVATE KEY-----\n".replace(/\\n/g, '\n'),
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
    if (uid === undefined || isNaN(uid)) {
        return res.status(400).json({ error: "uid is required" });
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