import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
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
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { auth, db } from "../constants/firebase"; 
import { Language } from "../constants/i18n";
import { router } from "expo-router";
import messaging from '@react-native-firebase/messaging';

GoogleSignin.configure({
  webClientId: "996742553850-275a0cb51akf9ucsbd385an1pq5tkrup.apps.googleusercontent.com",
});

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
  matchDistance?: number;
  isFirstPurchase?: boolean;
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
const SESSION_KEY = "@nighton_session_uid";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCacheLoaded, setIsCacheLoaded] = useState(false);

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

    // 1. 캐시 먼저 로드 (빠른 UI 표시용)
    AsyncStorage.getItem(USER_KEY).then((cached) => {
      if (cached) {
        try {
          const cachedUser = JSON.parse(cached) as UserProfile;
          console.log("💾 캐시된 유저 로드:", cachedUser.nickname);
          setUser(cachedUser);
        } catch (e) {
          console.log("⚠️ 캐시 파싱 실패:", e);
        }
      }
      setIsCacheLoaded(true);
    });

    let unsubscribeSnapshot: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      console.log("🔄 Auth 상태 변경:", fbUser ? fbUser.uid : "없음");

      // 기존 스냅샷 구독 정리
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = null;
      }

      if (fbUser) {
        // 세션 UID 저장 (로그인 유지 확인용)
        await AsyncStorage.setItem(SESSION_KEY, fbUser.uid);

        // FCM 토큰 갱신 (백그라운드)
        refreshFCMToken(fbUser.uid).catch(console.error);

        const userRef = doc(db, "users", fbUser.uid);

        // 먼저 getDoc으로 즉시 데이터 가져오기 (onSnapshot 연결 전)
        try {
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const userData = { id: snap.id, ...snap.data() } as UserProfile;
            setUser(userData);
            await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
          }
        } catch (e) {
          console.log("⚠️ 초기 프로필 로드 실패, 캐시 사용");
        }

        // 실시간 구독
        unsubscribeSnapshot = onSnapshot(
          userRef,
          { includeMetadataChanges: false },
          (docSnap) => {
            if (docSnap.exists()) {
              const userData = { id: docSnap.id, ...docSnap.data() } as UserProfile;
              console.log("✅ 유저 프로필 업데이트:", userData.nickname || "신규유저");
              setUser(userData);
              AsyncStorage.setItem(USER_KEY, JSON.stringify(userData)).catch(console.error);
            } else {
              console.log("⚠️ Firestore에 유저 문서 없음");
            }
            setIsLoading(false);
          },
          (error) => {
            console.error("❌ Firestore 스냅샷 에러:", error);
            // 에러 시 캐시된 유저 유지 (로그아웃 안 시킴)
            setIsLoading(false);
          }
        );

        setIsLoading(false);

      } else {
        console.log("🔓 로그인된 유저 없음");

        // 세션 확인: AsyncStorage에 UID가 있으면 Firebase 재연결 대기
        const savedUid = await AsyncStorage.getItem(SESSION_KEY);
        if (savedUid) {
          console.log("💾 세션 UID 있음, 캐시 유지 중...");
          // 캐시된 유저 유지하고 로딩만 해제 (강제 로그아웃 안 함)
          setIsLoading(false);
          return;
        }

        setUser(null);
        await AsyncStorage.removeItem(USER_KEY);
        setIsLoading(false);
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  async function loginWithGoogle() {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error("ID token 없음");

      const credential = GoogleAuthProvider.credential(idToken);
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
            fcmToken: fcmToken || "",
          };
          await setDoc(userRef, newUser);
        } else if (fcmToken) {
          await setDoc(userRef, { fcmToken }, { merge: true });
        }
        router.replace("/(tabs)");
      }
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        console.log("구글 로그인 취소");
      } else {
        console.error("❌ 구글 로그인 에러:", error);
        throw error;
      }
    }
  }

  async function signUp(email: string, pass: string) {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const fbUser = userCredential.user;
      const fcmToken = await getFCMToken();

      const newUser: UserProfile = {
        id: fbUser.uid,
        nickname: "", bio: "", gender: "male", age: 25, language: "en", location: "",
        coins: 0, blockedUsers: [], createdAt: Date.now(),
        fcmToken: fcmToken || "",
      };

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
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      console.log("구글 로그아웃 스킵:", e);
    }
    if (user) {
      const userRef = doc(db, "users", user.id);
      await setDoc(userRef, { fcmToken: null }, { merge: true });
    }
    await signOut(auth);
    await AsyncStorage.removeItem(USER_KEY);
    await AsyncStorage.removeItem(SESSION_KEY);
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
    } catch (error) {
      console.error("❌ 업데이트 실패:", error);
    }
  }

  async function addCoins(amount: number) { 
    if (!user) return; 
    const userRef = doc(db, "users", user.id);
    await updateDoc(userRef, { 
      coins: (user.coins || 0) + amount,
      isFirstPurchase: false,
    }); 
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

  const computedIsLoading = isLoading || !isCacheLoaded;
  const isAuthenticated = user !== null;

  const isProfileComplete = useMemo(() => {
    if (!user) return false;
    return !!(user.nickname && user.nickname.trim().length > 0);
  }, [user]);

  const value = useMemo(() => ({
    user,
    isLoading: computedIsLoading,
    isAuthenticated,
    isProfileComplete,
    loginWithGoogle,
    signUp,
    signIn,
    checkEmailVerified,
    logout,
    deleteAccount,
    updateProfile,
    addCoins,
    spendCoins,
    blockUser,
    unblockUser,
  }), [user, computedIsLoading, isProfileComplete]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}