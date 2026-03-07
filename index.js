const express = require('express');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json()); // JSON 요청을 읽기 위해 필수

// ✅ 1. 파이어베이스 어드민 초기화 (로컬 파일 방식)
// 폴더에 넣은 firebase-service-account.json 파일을 직접 불러옵니다.
const serviceAccount = require("./firebase-service-account.json");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const APP_ID = process.env.APP_ID;
const APP_CERTIFICATE = process.env.APP_CERTIFICATE;

// [기존] 아고라 토큰 생성 API
app.get('/rtc-token', (req, res) => {
  const channelName = req.query.channelName;
  if (!channelName) return res.status(400).json({ error: 'channelName is required' });

  const uid = 0;
  const role = RtcRole.PUBLISHER;
  const privilegeExpiredTs = Math.floor(Date.now() / 1000) + 3600;

  const token = RtcTokenBuilder.buildTokenWithUid(APP_ID, APP_CERTIFICATE, channelName, uid, role, privilegeExpiredTs);
  return res.json({ token });
});

// [신규] 전화 알림 전송 API
app.post('/send-call-notification', async (req, res) => {
  try {
    const { targetToken, callerName, callerId, convoId } = req.body;

    // 필수 데이터 확인
    if (!targetToken || !callerName || !convoId) {
      console.log("⚠️ 필수 필드 누락:", req.body);
      return res.status(400).json({ error: 'Missing required fields' });
    }

    console.log(`☎️ [알림 요청] 발신: ${callerName}, 대상 토큰: ${targetToken.substring(0, 10)}...`);

    // 📱 FCM 메시지 구성 (애플/안드로이드 모두 대응)
    const message = {
      token: targetToken,
      // 1. 앱이 백그라운드/종료 상태일 때 OS가 띄워주는 알림
      notification: {
        title: '📞 전화 도착',
        body: `${callerName}님에게서 전화가 왔습니다.`,
      },
      // 2. 앱 내부(RootLayout.tsx)에서 실시간으로 처리할 데이터
      data: {
        type: 'VOICE_CALL', // 또는 'CALL_REQUEST' (RootLayout 조건과 일치해야 함)
        callerName: String(callerName),
        callerId: String(callerId || ""),
        convoId: String(convoId),
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
          clickAction: 'FLUTTER_NOTIFICATION_CLICK', // 푸시 클릭 시 앱 열기 대응
        },
      },
      apns: {
        payload: {
          aps: {
            contentAvailable: true,
            sound: 'default',
          },
        },
      },
    };

    const response = await admin.messaging().send(message);
    console.log("✅ FCM 전송 성공:", response);
    res.json({ success: true, messageId: response });

  } catch (error) {
    console.error('❌ FCM Error:', error);
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`🚀 Server is running on port ${port}`);
});
