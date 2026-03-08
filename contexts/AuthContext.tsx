import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  signOut, 
  GoogleAuthProvider, 
  signInWithCredential,
  sendEmailVerification,
  reload,
  onAuthStateChanged
} from "firebase/auth";
import { doc, setDoc, onSnapshot, updateDoc, getDoc } from "firebase/firestore";
import * as Google from "expo-auth-session/providers/google";
import * as WebBrowser from "expo-web-browser";
import { auth, db } from "../constants/firebase"; 
import { Language } from "../constants/i18n";
import { router } from "expo-router";
import messaging from '@react-native-firebase/messaging';

WebBrowser.maybeCompleteAuthSession();

export type Gender = "male" | "female";
export interface UserProfile {
  id: string;
  nickname: string;
  bio: string;
  voiceIntroUrl?: string;
  gender: Gender;
  age: number;
  language: Language;
  location: string;
  locationCoords?: { lat: number; lon: number };
  profilePhoto?: string;
  coins: number;
  blockedUsers: string[];
  createdAt: number;
  fcmToken?: string;
}

interface AuthContextValue {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isProfileComplete: boolean;
  loginWithGoogle: () => Promise<void>;
  signUp: (email: string, pass: string) => Promise<void>;
  signIn: (email: string, pass: string) => Promise<void>;
  checkEmailVerified: () => Promise<boolean>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>;
  addCoins: (amount: number) => Promise<void>;
  spendCoins: (amount: number) => Promise<boolean>;
  blockUser: (userId: string) => Promise<void>;
  unblockUser: (userId: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const USER_KEY = "@nighton_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // 📱 FCM 토큰 획득 함수 (독립적으로 분리)
  async function getFCMToken() {
    try {
      const authStatus = await messaging().requestPermission();
      const enabled = 
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (!enabled) return null;
      return await messaging().getToken();
    } catch (error) {
      console.log("⚠️ FCM 토큰 획득 실패:", error);
      return null;
    }
  }

  // 📱 기존 유저나 로그인 시 토큰을 업데이트하는 함수
  async function refreshFCMToken(uid: string) {
    try {
      const token = await getFCMToken();
      if (token) {
        const userRef = doc(db, "users", uid);
        await setDoc(userRef, { 
          fcmToken: token,
          lastTokenUpdate: Date.now() 
        }, { merge: true });
        console.log("✅ FCM 토큰 업데이트 완료");
      }
    } catch (error) {
      console.log("❌ FCM 업데이트 에러:", error);
    }
  }

  useEffect(() => {
    console.log("🔐 [AuthContext] 인증 리스너 가동 중...");

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (fbUser) {
        console.log("👤 [AuthContext] 유저 감지됨 UID:", fbUser.uid);

        // 로그인된 상태라면 토큰 최신화 시도
        refreshFCMToken(fbUser.uid);

        const userRef = doc(db, "users", fbUser.uid);
        const unsubscribeSnapshot = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            const userData = docSnap.data() as UserProfile;
            console.log("✅ 유저 프로필 로드 완료:", userData.nickname || "신규유저");
            setUser(userData);
            AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
          } else {
            setUser(null);
          }
          setIsLoading(false);
        }, (error) => {
          console.error("❌ Firestore 스냅샷 에러:", error);
          setIsLoading(false);
        });

        return () => unsubscribeSnapshot();
      } else {
        console.log("🔓 로그인된 유저 없음");
        setUser(null);
        setIsLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: "996742553850-275a0cb51akf9ucsbd385an1pq5tkrup.apps.googleusercontent.com",
    iosClientId: "996742553850-275a0cb51akf9ucsbd385an1pq5tkrup.apps.googleusercontent.com",
    androidClientId: "996742553850-275a0cb51akf9ucsbd385an1pq5tkrup.apps.googleusercontent.com",
  });

  async function loginWithGoogle() {
    try {
      const result = await promptAsync();
      if (result?.type === "success") {
        const { id_token } = result.params;
        const credential = GoogleAuthProvider.credential(id_token);
        const userCredential = await signInWithCredential(auth, credential);
        
        if (userCredential.user) {
          const fcmToken = await getFCMToken();
          const userRef = doc(db, "users", userCredential.user.uid);
          const snap = await getDoc(userRef);
          
          if (!snap.exists()) {
            const newUser: UserProfile = {
              id: userCredential.user.uid,
              nickname: "", bio: "", gender: "male", age: 25, language: "en", location: "",
              coins: 0, blockedUsers: [], createdAt: Date.now(),
              fcmToken: fcmToken || "", // 구글 최초 가입 시에도 토큰 포함
            };
            await setDoc(userRef, newUser);
          } else if (fcmToken) {
            await setDoc(userRef, { fcmToken }, { merge: true });
          }
          router.replace("/(tabs)");
        }
      }
    } catch (error) { 
      console.error("❌ 구글 로그인 에러:", error);
      throw error; 
    }
  }

  // ✅ [수정 완료] 회원가입 시 토큰을 먼저 따고 문서를 생성함
  async function signUp(email: string, pass: string) {
    try {
      // 1. Auth 계정 생성
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const fbUser = userCredential.user;

      // 2. 즉시 FCM 토큰 획득 시도
      const fcmToken = await getFCMToken();
      console.log("📱 회원가입 중 FCM 토큰 획득:", fcmToken ? "성공" : "실패");

      // 3. 유저 데이터 객체 구성 (토큰 포함)
      const newUser: UserProfile = {
        id: fbUser.uid,
        nickname: "", 
        bio: "", 
        gender: "male", 
        age: 25, 
        language: "en", 
        location: "",
        coins: 0, 
        blockedUsers: [], 
        createdAt: Date.now(),
        fcmToken: fcmToken || "", // 여기에 토큰이 박힘
      };

      // 4. Firestore에 문서 생성
      await setDoc(doc(db, "users", fbUser.uid), newUser);
      
      await sendEmailVerification(fbUser);
      router.replace("/(auth)/verify-email");
    } catch (e) { 
      throw e; 
    }
  }

  async function signIn(email: string, pass: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, pass);
      const fbUser = userCredential.user;
      if (!fbUser.emailVerified) {
        router.replace("/(auth)/verify-email");
        return;
      }
      // 로그인 시에도 토큰 갱신
      refreshFCMToken(fbUser.uid);
      router.replace("/(tabs)");
    } catch (e) { throw e; }
  }

  async function checkEmailVerified() {
    if (auth.currentUser) {
      await reload(auth.currentUser);
      return auth.currentUser.emailVerified;
    }
    return false;
  }

  async function logout() {
    if (user) {
      const userRef = doc(db, "users", user.id);
      await setDoc(userRef, { fcmToken: null }, { merge: true });
    }
    await signOut(auth);
    await AsyncStorage.removeItem(USER_KEY);
    setUser(null);
    router.replace("/(auth)/welcome");
  }

  async function updateProfile(updates: Partial<UserProfile>) {
    if (!user) return;
    try {
      const userRef = doc(db, "users", user.id);
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== undefined)
      );
      await setDoc(userRef, cleanUpdates, { merge: true });
      console.log("✅ 프로필 업데이트 성공");
    } catch (error) {
      console.error("❌ 업데이트 실패:", error);
    }
  }

  async function addCoins(amount: number) { 
    if (!user) return; 
    const userRef = doc(db, "users", user.id);
    await updateDoc(userRef, { coins: (user.coins || 0) + amount }); 
  }

  async function spendCoins(amount: number): Promise<boolean> {
    if (!user || (user.coins || 0) < amount) return false;
    const userRef = doc(db, "users", user.id);
    await updateDoc(userRef, { coins: user.coins - amount });
    return true;
  }

  async function blockUser(userId: string) {
    if (!user) return;
    const currentBlocked = user.blockedUsers || [];
    if (!currentBlocked.includes(userId)) {
      await updateProfile({ blockedUsers: [...currentBlocked, userId] });
    }
  }

  async function unblockUser(userId: string) {
    if (!user) return;
    const currentBlocked = user.blockedUsers || [];
    await updateProfile({ blockedUsers: currentBlocked.filter((id) => id !== userId) });
  }

  async function deleteAccount() {
    await AsyncStorage.clear();
    await signOut(auth);
    setUser(null);
    router.replace("/(auth)/welcome");
  }

  const isAuthenticated = user !== null;
  const isProfileComplete = useMemo(() => {
    if (!user) return false;
    return !!(user.nickname && user.nickname.trim().length > 0);
  }, [user]);

  const value = useMemo(() => ({
    user, isLoading, isAuthenticated, isProfileComplete,
    loginWithGoogle, signUp, signIn, checkEmailVerified, logout, deleteAccount,
    updateProfile, addCoins, spendCoins, blockUser, unblockUser,
  }), [user, isLoading, isProfileComplete]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}