import { initializeApp } from "firebase/app";
import { initializeAuth } from "firebase/auth";
import { Firestore, getFirestore } from "firebase/firestore";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: "AIzaSyC4jFZjA56XQoLBSjGGyBiMKPR42rLv_Sk",
  authDomain: "nighton-f6605.firebaseapp.com",
  projectId: "nighton-f6605",
  storageBucket: "nighton-f6605.firebasestorage.app",
  messagingSenderId: "996742553850",
  appId: "1:996742553850:web:f3536cf0f2426cffdca943",
  measurementId: "G-RRF2JBD7TN",
};

const app = initializeApp(firebaseConfig);

// @ts-ignore
export const auth = initializeAuth(app, {
  // @ts-ignore
  persistence: require("firebase/auth").getReactNativePersistence(AsyncStorage),
});

export const db: Firestore = getFirestore(app);

export default app;