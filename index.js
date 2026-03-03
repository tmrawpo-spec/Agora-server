const express = require('express');
const { RtcTokenBuilder, RtcRole } = require('agora-access-token');
const cors = require('cors');

const app = express();
app.use(cors());

// Render 환경 변수에서 키를 가져옵니다.
const APP_ID = process.env.APP_ID;
const APP_CERTIFICATE = process.env.APP_CERTIFICATE;

app.get('/rtc-token', (req, res) => {
  // 'as string' 부분을 지웠습니다.
  const channelName = req.query.channelName;
  
  if (!channelName) {
    return res.status(400).json({ error: 'channelName is required' });
  }

  const uid = 0;
  const role = RtcRole.PUBLISHER;
  const expirationTimeInSeconds = 3600;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  try {
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channelName,
      uid,
      role,
      privilegeExpiredTs
    );
    return res.json({ token });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 포트 설정
const port = process.env.PORT || 10000;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
