import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";

const firebaseConfig = {
  // 👇 보내주신 정확한 API 키로 수정했습니다.
  apiKey: "AIzaSyC4jFZjA56XQoLBSjGGyBiMKPR42rLv_Sk", 
  AIzaSyC4jFZjA56XQoLBSjGGyBiMKPR42rLv_SkauthDomain: "nighton-f6605.firebaseapp.com",
  projectId: "nighton-f6605",
  storageBucket: "nighton-f6605.firebasestorage.app",
  messagingSenderId: "996742553850",
  appId: "1:996742553850:web:f3536cf0f2426cffdca943",
  measurementId: "G-RRF2JBD7TN",
};

// 파이어베이스 초기화
const app = initializeApp(firebaseConfig);

// 가장 안전하고 검증된 초기화 방식
export const auth = getAuth(app);
export const db: Firestore = getFirestore(app);

export default app;