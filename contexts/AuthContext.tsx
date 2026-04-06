import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
  useRef,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  signInWithCredential,
  sendEmailVerification,
  reload,
  onAuthStateChanged,
  User as FirebaseAuthUser,
} from "firebase/auth";
import {
  doc,
  setDoc,
  onSnapshot,
  updateDoc,
  getDoc,
  increment,
} from "firebase/firestore";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { auth, db } from "../constants/firebase";
import { Language } from "../constants/i18n";
import { router } from "expo-router";
import { getApp } from "@react-native-firebase/app";
import {
  getMessaging,
  requestPermission,
  getToken,
  AuthorizationStatus,
} from "@react-native-firebase/messaging";

GoogleSignin.configure({
  webClientId:
    "996742553850-275a0cb51akf9ucsbd385an1pq5tkrup.apps.googleusercontent.com",
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
  fcmToken?: string | null;
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

  const latestUserRef = useRef<UserProfile | null>(null);
  const profileUnsubscribeRef = useRef<(() => void) | null>(null);
  const isMountedRef = useRef(true);

  const setUserSafely = (nextUser: UserProfile | null) => {
    latestUserRef.current = nextUser;
    setUser(nextUser);
  };

  useEffect(() => {
    latestUserRef.current = user;
  }, [user]);

  function isEmailPasswordUser(fbUser: FirebaseAuthUser) {
    return fbUser.providerData.some((p) => p.providerId === "password");
  }

  async function getFCMToken() {
    try {
      const app = getApp();
      const firebaseMessaging = getMessaging(app);

      const authStatus = await requestPermission(firebaseMessaging);
      const enabled =
        authStatus === AuthorizationStatus.AUTHORIZED ||
        authStatus === AuthorizationStatus.PROVISIONAL;

      if (!enabled) return null;

      return await getToken(firebaseMessaging);
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
        await setDoc(
          userRef,
          {
            fcmToken: token,
            lastTokenUpdate: Date.now(),
          },
          { merge: true }
        );
        console.log("✅ FCM 토큰 업데이트 완료");
      }
    } catch (error) {
      console.log("❌ FCM 업데이트 에러:", error);
    }
  }

  async function ensureUserProfileDocument(fbUser: FirebaseAuthUser) {
    const userRef = doc(db, "users", fbUser.uid);
    const snap = await getDoc(userRef);
    const fcmToken = await getFCMToken();

    if (!snap.exists()) {
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
        fcmToken: fcmToken || "",
        isFirstPurchase: true,
      };

      await setDoc(userRef, newUser);
      return;
    }

    if (fcmToken) {
      await setDoc(
        userRef,
        {
          fcmToken,
          lastTokenUpdate: Date.now(),
        },
        { merge: true }
      );
    }
  }

  async function loadAndCacheUserProfile(uid: string) {
    const userRef = doc(db, "users", uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) return null;

    const userData = { id: snap.id, ...snap.data() } as UserProfile;
    setUserSafely(userData);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(userData));
    return userData;
  }

  function cleanupProfileSubscription() {
    if (profileUnsubscribeRef.current) {
      profileUnsubscribeRef.current();
      profileUnsubscribeRef.current = null;
    }
  }

  function subscribeUserProfile(uid: string) {
    cleanupProfileSubscription();

    const userRef = doc(db, "users", uid);

    profileUnsubscribeRef.current = onSnapshot(
      userRef,
      { includeMetadataChanges: false },
      (docSnap) => {
        if (!isMountedRef.current) return;

        if (docSnap.exists()) {
          const userData = { id: docSnap.id, ...docSnap.data() } as UserProfile;
          const cachedUser = latestUserRef.current;

          if (!userData.nickname && cachedUser?.nickname) {
            console.log("⏭️ snapshot 빈 프로필 무시, 캐시 유지");
            setIsLoading(false);
            return;
          }

          console.log("✅ 유저 프로필 업데이트:", userData.nickname || "신규유저");
          setUserSafely(userData);
          AsyncStorage.setItem(USER_KEY, JSON.stringify(userData)).catch(console.error);
        } else {
          console.log("⚠️ Firestore에 유저 문서 없음");
          setUserSafely(null);
          AsyncStorage.removeItem(USER_KEY).catch(console.error);
        }

        setIsLoading(false);
      },
      (error) => {
        if (!isMountedRef.current) return;
        console.error("❌ Firestore 스냅샷 에러:", error);
        setIsLoading(false);
      }
    );
  }

  function routeAfterProfileReady(
    authUser: FirebaseAuthUser,
    loadedUser: UserProfile | null
  ) {
    const targetUser = loadedUser ?? latestUserRef.current;
    const hasNickname = !!targetUser?.nickname?.trim();

    console.log(
      "🚀 최종 라우팅:",
      JSON.stringify({
        authUid: authUser.uid,
        emailVerified: authUser.emailVerified,
        hasNickname,
        nickname: targetUser?.nickname || "",
        profileUid: targetUser?.id || null,
      })
    );

    if (hasNickname) {
      router.replace("/(tabs)");
    } else {
      router.replace("/(auth)/profile-setup");
    }
  }

  async function bootstrapVerifiedUser(currentAuthUser: FirebaseAuthUser) {
    await ensureUserProfileDocument(currentAuthUser);
    await refreshFCMToken(currentAuthUser.uid);

    const loadedUser = await loadAndCacheUserProfile(currentAuthUser.uid);
    subscribeUserProfile(currentAuthUser.uid);
    setIsLoading(false);

    routeAfterProfileReady(currentAuthUser, loadedUser);
    return loadedUser;
  }

  useEffect(() => {
    isMountedRef.current = true;
    console.log("🔐 [AuthContext] 인증 리스너 가동 중...");

    AsyncStorage.getItem(USER_KEY).then((cached) => {
      if (!isMountedRef.current) return;

      if (cached) {
        try {
          const cachedUser = JSON.parse(cached) as UserProfile;
          console.log("💾 캐시된 유저 로드:", cachedUser.nickname);
          setUserSafely(cachedUser);
        } catch (e) {
          console.log("⚠️ 캐시 파싱 실패:", e);
        }
      }

      setIsCacheLoaded(true);
    });

    const unsubscribeAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (!isMountedRef.current) return;

      console.log("🔄 Auth 상태 변경:", fbUser ? fbUser.uid : "없음");
      cleanupProfileSubscription();

      if (fbUser) {
        await AsyncStorage.setItem(SESSION_KEY, fbUser.uid);

        try {
          await reload(fbUser);
        } catch (e) {
          console.log("⚠️ auth reload 실패:", e);
        }

        const currentAuthUser = auth.currentUser ?? fbUser;

        if (isEmailPasswordUser(currentAuthUser) && !currentAuthUser.emailVerified) {
          console.log("⛔ 이메일 미인증 유저 - verify-email로 이동");

          setUserSafely(null);
          await AsyncStorage.removeItem(USER_KEY);
          setIsLoading(false);

          router.replace("/(auth)/verify-email");
          return;
        }

        try {
          await bootstrapVerifiedUser(currentAuthUser);
        } catch (e) {
          console.log("⚠️ 인증 유저 초기화 실패:", e);
          setIsLoading(false);
        }
      } else {
        console.log("🔓 로그인된 유저 없음");

        setUserSafely(null);
        await AsyncStorage.removeItem(USER_KEY);
        await AsyncStorage.removeItem(SESSION_KEY);
        setIsLoading(false);
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribeAuth();
      cleanupProfileSubscription();
    };
  }, []);

  async function loginWithGoogle() {
    try {
      setIsLoading(true);

      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error("ID token 없음");

      const credential = GoogleAuthProvider.credential(idToken);
      await signInWithCredential(auth, credential);
    } catch (error: any) {
      setIsLoading(false);

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
      setIsLoading(true);

      const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
      const fbUser = userCredential.user;

      await sendEmailVerification(fbUser);

      await AsyncStorage.setItem(SESSION_KEY, fbUser.uid);
      await AsyncStorage.removeItem(USER_KEY);
      setUserSafely(null);
      setIsLoading(false);

      router.replace("/(auth)/verify-email");
    } catch (e) {
      setIsLoading(false);
      throw e;
    }
  }

  async function signIn(email: string, pass: string) {
    try {
      setIsLoading(true);
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (e) {
      setIsLoading(false);
      throw e;
    }
  }

  async function checkEmailVerified() {
    const fbUser = auth.currentUser;
    if (!fbUser) return false;

    setIsLoading(true);
    await reload(fbUser);

    const currentUser = auth.currentUser;
    const isVerified = currentUser?.emailVerified === true;

    if (!isVerified || !currentUser) {
      setIsLoading(false);
      return false;
    }

    await bootstrapVerifiedUser(currentUser);
    return true;
  }

  async function logout() {
    try {
      await GoogleSignin.signOut();
    } catch (e) {
      console.log("구글 로그아웃 스킵:", e);
    }

    cleanupProfileSubscription();

    if (latestUserRef.current) {
      const userRef = doc(db, "users", latestUserRef.current.id);
      await setDoc(userRef, { fcmToken: null }, { merge: true });
    }

    await signOut(auth);
    await AsyncStorage.removeItem(USER_KEY);
    await AsyncStorage.removeItem(SESSION_KEY);
    setUserSafely(null);
    router.replace("/(auth)/welcome");
  }

  async function updateProfile(updates: Partial<UserProfile>) {
    const uid = latestUserRef.current?.id || auth.currentUser?.uid;
    if (!uid) {
      throw new Error("로그인 유저를 찾을 수 없습니다.");
    }

    try {
      const userRef = doc(db, "users", uid);
      const cleanUpdates = Object.fromEntries(
        Object.entries(updates).filter(([_, value]) => value !== undefined)
      );

      await setDoc(userRef, cleanUpdates, { merge: true });
      await loadAndCacheUserProfile(uid);
    } catch (error) {
      console.error("❌ 업데이트 실패:", error);
      throw error;
    }
  }

  async function addCoins(amount: number) {
    const uid = latestUserRef.current?.id || auth.currentUser?.uid;
    if (!uid) return;

    const userRef = doc(db, "users", uid);

    await updateDoc(userRef, {
      coins: increment(amount),
      isFirstPurchase: false,
    });
  }

  async function spendCoins(amount: number): Promise<boolean> {
    const currentUser = latestUserRef.current;
    if (!currentUser || (currentUser.coins || 0) < amount) {
      return false;
    }

    const userRef = doc(db, "users", currentUser.id);

    await updateDoc(userRef, {
      coins: increment(-amount),
    });

    return true;
  }

  async function blockUser(userId: string) {
    if (!latestUserRef.current) return;

    const currentBlocked = latestUserRef.current.blockedUsers || [];
    if (!currentBlocked.includes(userId)) {
      await updateProfile({ blockedUsers: [...currentBlocked, userId] });
    }
  }

  async function unblockUser(userId: string) {
    if (!latestUserRef.current) return;

    const currentBlocked = latestUserRef.current.blockedUsers || [];
    await updateProfile({
      blockedUsers: currentBlocked.filter((id) => id !== userId),
    });
  }

  async function deleteAccount() {
    cleanupProfileSubscription();
    await AsyncStorage.clear();
    await signOut(auth);
    setUserSafely(null);
    router.replace("/(auth)/welcome");
  }

  const computedIsLoading = isLoading || !isCacheLoaded;
  const isAuthenticated = user !== null;

  const isProfileComplete = useMemo(() => {
    if (!user) return false;
    return !!user.nickname?.trim();
  }, [user]);

  const value = useMemo(
    () => ({
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
    }),
    [user, computedIsLoading, isAuthenticated, isProfileComplete]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
