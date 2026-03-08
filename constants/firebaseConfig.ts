// constants/firebaseConfig.ts
import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "",
  authDomain: "nighton-f6605.firebaseapp.com",
  projectId: "nighton-f6605",
  storageBucket: "nighton-f6605.firebasestorage.app",
  messagingSenderId: "996742553850",
  appId: "1:996742553850:web:f3536cf0f2426cffdca943",
  measurementId: "G-RRF2JBD7TN"
};

// ✅ 이미 초기화된 앱이 있으면 그것을 쓰고, 없으면 새로 초기화합니다.
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);