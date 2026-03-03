const express = require('express');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json()); // JSON 요청을 읽기 위해 추가

// 1. 파이어베이스 어드민 초기화 (환경 변수에서 키를 가져옴)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

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
  const { targetToken, callerName, convoId } = req.body;

  if (!targetToken || !callerName || !convoId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const message = {
    token: targetToken,
    data: {
      type: 'CALL_REQUEST',
      callerName: callerName,
      convoId: convoId,
    },
    // 앱이 백그라운드일 때 보일 알림 설정
    notification: {
      title: '전화 오는 중...',
      body: `${callerName}님에게서 전화가 왔습니다.`,
    },
    android: { priority: 'high' },
    apns: { payload: { aps: { contentAvailable: true } } },
  };

  try {
    await admin.messaging().send(message);
    res.json({ success: true });
  } catch (error) {
    console.error('FCM Error:', error);
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
