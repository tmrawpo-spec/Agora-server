const { getApp } = require("@react-native-firebase/app");
const {
  getMessaging,
  setBackgroundMessageHandler,
} = require("@react-native-firebase/messaging");

const app = getApp();
const firebaseMessaging = getMessaging(app);

setBackgroundMessageHandler(firebaseMessaging, async (remoteMessage) => {
  console.log("📩 [백그라운드 FCM 수신]:", remoteMessage.data);
});

require("expo-router/entry");
