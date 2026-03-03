import { RtcTokenBuilder, RtcRole } from "agora-token";

// 아고라 콘솔에서 복사한 값을 여기에 넣으세요
const APP_ID = "94e90b1837c04de4b4a21aa6caaf8f03";
const APP_CERTIFICATE = "5857791ccd0a4964b76504694725b88b";

// 토큰 발급 엔드포인트 추가
app.get("/rtc-token", (req, res) => {
  const channelName = req.query.channelName as string;
  if (!channelName) {
    return res.status(400).json({ error: "channelName is required" });
  }

  const uid = 0; // 유저 ID (0으로 설정하면 아고라가 자동 할당)
  const role = RtcRole.PUBLISHER;
  const expirationTimeInSeconds = 3600; // 1시간 유효
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERTIFICATE,
    channelName,
    uid,
    role,
    privilegeExpiredTs
  );

  return res.json({ token });
});