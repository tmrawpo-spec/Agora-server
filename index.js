const express = require('express');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const cors = require('cors');
const admin = require('firebase-admin');
const axios = require('axios'); // ✅ Expo 서버에 요청을 보내기 위해 추가

const app = express();
app.use(cors());
app.use(express.json());

// 1. 파이어베이스 어드민 초기화 (인증용으로 유지)
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

// [수정] 전화 알림 전송 API (Expo 전용으로 변경)
app.post('/send-call-notification', async (req, res) => {
  const { targetToken, callerName, convoId } = req.body;

  if (!targetToken || !callerName || !convoId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // 💡 targetToken이 Expo 토큰인지 확인
  if (!targetToken.startsWith('ExponentPushToken')) {
    console.error('❌ 유효하지 않은 Expo 토큰:', targetToken);
    return res.status(400).json({ error: 'Invalid Expo Push Token' });
  }

  try {
    // ✅ FCM 대신 Expo의 Push API 엔드포인트로 직접 발송합니다.
    const response = await axios.post('https://exp.host/--/api/v2/push/send', {
      to: targetToken,
      title: '📞 전화 오는 중...',
      body: `${callerName}님에게서 전화가 왔습니다.`,
      data: { 
        type: 'CALL_REQUEST', 
        callerName: callerName, 
        convoId: convoId 
      },
      priority: 'high',
      sound: 'default',
      channelId: 'default', // 안드로이드 알림 채널
    });

    console.log('🚀 Expo 서버 응답:', response.data);
    res.json({ success: true, details: response.data });
  } catch (error) {
    console.error('❌ Expo Push Error:', error.response ? error.response.data : error.message);
    res.status(500).json({ error: error.message });
  }
});

const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
