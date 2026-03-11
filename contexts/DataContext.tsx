import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  ReactNode,
} from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Language } from "@/constants/i18n";
import { Gender } from "./AuthContext";

import { db } from "@/constants/firebase";
import { 
  collection, 
  addDoc, 
  onSnapshot, 
  query, 
  orderBy, 
  doc, 
  updateDoc, 
  arrayUnion, 
  increment,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

export interface UserProfile {
  id: string;
  nickname: string;
  gender: Gender;
  age: number;
  language: Language;
  location: string;
  distanceKm: number;
  profilePhoto?: string;
  voiceIntroUrl?: string;
  isOnline: boolean;
  fcmToken?: string; 
}

export interface Visitor extends UserProfile {
  visitedAt: number;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: number;
  type?: "text" | "call" | "missed_call";
}

// ✅ Match History 인터페이스 추가
export interface MatchHistory {
  id: string;
  profile: UserProfile;
  matchedAt: number;
  isUnlocked: boolean;
}

export interface Conversation {
  id: string;
  matchedUserId: string;
  matchedUser: UserProfile;
  messages: Message[];
  createdAt: number;
  lastMessage?: string;
  isBlocked?: boolean;
  isMessageUnlocked: boolean; 
  isVoiceUnlocked: boolean;   
  isFriend: boolean;          
}

export interface PostComment {
  id: string;
  userId: string;
  nickname: string;
  profilePhoto?: string;
  text: string;
  createdAt: number;
}

export interface Post {
  id: string;
  userId: string;
  nickname: string;
  profilePhoto?: string;
  gender: Gender;
  language: Language;
  content: string;
  photo?: string;
  voiceUrl?: string;
  comments: PostComment[];
  commentedBy: string[];
  likes: number;
  likedBy: string[];
  isPopular: boolean;
  createdAt: number;
}

interface DataContextValue {
  conversations: Conversation[];
  posts: Post[];
  visitors: Visitor[];
  matchHistories: MatchHistory[]; // ✅ 추가
  addConversation: (
    matchedUser: UserProfile, 
    options?: { messageUnlocked?: boolean; voiceUnlocked?: boolean; isFriend?: boolean; myUserId?: string }
  ) => Promise<Conversation>;
  sendMessage: (conversationId: string, senderId: string, text: string, type?: "text" | "call" | "missed_call") => Promise<void>;
  subscribeToMessages: (conversationId: string, callback: (messages: Message[]) => void) => () => void;
  unlockVoice: (conversationId: string) => Promise<void>;
  blockFriend: (conversationId: string) => Promise<void>;
  unblockFriend: (conversationId: string) => Promise<void>;
  removeFriend: (conversationId: string) => Promise<void>;
  addPost: (post: Omit<Post, "id" | "comments" | "likes" | "createdAt" | "likedBy" | "commentedBy" | "isPopular">) => Promise<void>;
  addComment: (postId: string, comment: Omit<PostComment, "id" | "createdAt">) => Promise<void>;
  likePost: (postId: string, userId: string) => Promise<void>;
  recordVisit: (visitorProfile: UserProfile, myGender?: Gender) => Promise<void>;
  refreshConversations: () => Promise<void>;
  refreshPosts: () => Promise<void>;
  refreshVisitors: () => Promise<void>;
  addMatchHistory: (profile: UserProfile) => Promise<void>; // ✅ 추가
  unlockMatchHistory: (id: string) => Promise<boolean>; // ✅ 추가
}

const DataContext = createContext<DataContextValue | null>(null);

const CONVOS_KEY = "@nighton_conversations";
const VISITORS_KEY = "@nighton_visitors";
const MATCH_HISTORY_KEY = "@nighton_match_histories"; // ✅ 추가

function makeId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function makeConvoId(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join("_");
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [matchHistories, setMatchHistories] = useState<MatchHistory[]>([]); // ✅ 추가

  useEffect(() => {
    refreshConversations();
    refreshVisitors();
    refreshMatchHistories(); // ✅ 추가

    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Post[];

      if (fetchedPosts.length > 0) {
        setPosts(fetchedPosts);
      }
    }, (error) => {
      console.error("Firestore Listener Error:", error);
    });

    return () => unsubscribe();
  }, []);

  async function refreshConversations() {
    try {
      const stored = await AsyncStorage.getItem(CONVOS_KEY);
      if (!stored) return;

      const parsed: Conversation[] = JSON.parse(stored);

      const updatedConversations = await Promise.all(parsed.map(async (convo) => {
        try {
          const userRef = doc(db, "users", convo.matchedUserId);
          const userSnap = await getDoc(userRef);

          if (userSnap.exists()) {
            const firestoreData = userSnap.data();
            return {
              ...convo,
              matchedUser: {
                ...convo.matchedUser,
                fcmToken: firestoreData.fcmToken || firestoreData.TargetToken || convo.matchedUser.fcmToken,
                isOnline: firestoreData.isOnline ?? convo.matchedUser.isOnline,
                profilePhoto: firestoreData.profilePhoto || convo.matchedUser.profilePhoto,
              },
              isMessageUnlocked: convo.isMessageUnlocked ?? false,
              isVoiceUnlocked: convo.isVoiceUnlocked ?? false,
              isFriend: convo.isFriend ?? false,
            };
          }
          return convo;
        } catch (e) {
          return convo;
        }
      }));

      setConversations(updatedConversations);
    } catch (e) { 
      console.error("refreshConversations Error:", e); 
    }
  }

  async function refreshPosts() {}

  async function refreshVisitors() {
    try {
      const stored = await AsyncStorage.getItem(VISITORS_KEY);
      if (stored) setVisitors(JSON.parse(stored));
    } catch (e) { console.error(e); }
  }

  // ✅ match history 로드
  async function refreshMatchHistories() {
    try {
      const stored = await AsyncStorage.getItem(MATCH_HISTORY_KEY);
      if (stored) setMatchHistories(JSON.parse(stored));
    } catch (e) { console.error(e); }
  }

  async function saveConversations(convos: Conversation[]) {
    await AsyncStorage.setItem(CONVOS_KEY, JSON.stringify(convos));
    setConversations(convos);
  }

  async function saveVisitors(v: Visitor[]) {
    await AsyncStorage.setItem(VISITORS_KEY, JSON.stringify(v));
    setVisitors(v);
  }

  async function addConversation(
    matchedUser: UserProfile,
    options?: { messageUnlocked?: boolean; voiceUnlocked?: boolean; isFriend?: boolean; myUserId?: string }
  ): Promise<Conversation> {

    let latestFCMToken = matchedUser.fcmToken;
    try {
      const userRef = doc(db, "users", matchedUser.id);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        latestFCMToken = data.fcmToken || data.TargetToken;
      }
    } catch (err) {
      console.warn("최신 토큰 조회 실패", err);
    }

    const updatedMatchedUser = { ...matchedUser, fcmToken: latestFCMToken };
    const existing = conversations.find((c) => c.matchedUserId === matchedUser.id);

    if (existing) {
      const updated = conversations.map(c => 
        c.id === existing.id 
          ? { 
              ...c, 
              matchedUser: updatedMatchedUser,
              isMessageUnlocked: options?.messageUnlocked ?? c.isMessageUnlocked,
              isVoiceUnlocked: options?.voiceUnlocked ?? c.isVoiceUnlocked,
              isFriend: options?.isFriend ?? c.isFriend
            } 
          : c
      );
      await saveConversations(updated);
      return updated.find(u => u.id === existing.id)!;
    }

    const convoId = options?.myUserId 
      ? makeConvoId(options.myUserId, matchedUser.id)
      : makeId();

    const convo: Conversation = { 
      id: convoId, 
      matchedUserId: matchedUser.id, 
      matchedUser: updatedMatchedUser, 
      messages: [], 
      createdAt: Date.now(), 
      isBlocked: false,
      isMessageUnlocked: options?.messageUnlocked ?? false,
      isVoiceUnlocked: options?.voiceUnlocked ?? false,
      isFriend: options?.isFriend ?? false
    };
    const updatedList = [convo, ...conversations];
    await saveConversations(updatedList);
    return convo;
  }

  async function sendMessage(
    conversationId: string, 
    senderId: string, 
    text: string,
    type: "text" | "call" | "missed_call" = "text"
  ) {
    const msg: Message = { 
      id: makeId(), 
      senderId, 
      text, 
      createdAt: Date.now(),
      type,
    };

    try {
      await addDoc(collection(db, "chats", conversationId, "messages"), msg);
      await setDoc(doc(db, "chats", conversationId), {
        lastMessage: text,
        lastUpdated: Date.now(),
        conversationId,
      }, { merge: true });
    } catch (e) {
      console.error("Firestore 메시지 저장 실패:", e);
    }

    const updated = conversations.map((c) => {
      if (c.id !== conversationId) return c;
      return { ...c, messages: [...c.messages, msg], lastMessage: text, isMessageUnlocked: true };
    });
    await saveConversations(updated);
  }

  // ✅ match history 추가
  async function addMatchHistory(profile: UserProfile) {
    try {
      const stored = await AsyncStorage.getItem(MATCH_HISTORY_KEY);
      const current: MatchHistory[] = stored ? JSON.parse(stored) : [];
      
      // 중복 방지
      const exists = current.find(h => h.profile.id === profile.id);
      if (exists) return;

      const newEntry: MatchHistory = {
        id: makeId(),
        profile,
        matchedAt: Date.now(),
        isUnlocked: false,
      };
      const updated = [newEntry, ...current];
      await AsyncStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(updated));
      setMatchHistories(updated);
    } catch (e) {
      console.error("match history 저장 실패:", e);
    }
  }

  // ✅ match history unlock
  async function unlockMatchHistory(id: string): Promise<boolean> {
    try {
      const stored = await AsyncStorage.getItem(MATCH_HISTORY_KEY);
      const current: MatchHistory[] = stored ? JSON.parse(stored) : [];
      const updated = current.map(h => h.id === id ? { ...h, isUnlocked: true } : h);
      await AsyncStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(updated));
      setMatchHistories(updated);
      return true;
    } catch (e) {
      console.error("match history unlock 실패:", e);
      return false;
    }
  }

  async function unlockVoice(conversationId: string) {
    const updated = conversations.map((c) => 
      c.id === conversationId ? { ...c, isVoiceUnlocked: true, isFriend: true } : c
    );
    await saveConversations(updated);
  }

  async function blockFriend(conversationId: string) {
    const updated = conversations.map((c) => c.id === conversationId ? { ...c, isBlocked: true } : c);
    await saveConversations(updated);
  }

  async function unblockFriend(conversationId: string) {
    const updated = conversations.map((c) => c.id === conversationId ? { ...c, isBlocked: false } : c);
    await saveConversations(updated);
  }

  async function removeFriend(conversationId: string) {
    const updated = conversations.filter((c) => c.id !== conversationId);
    await saveConversations(updated);
  }

  async function recordVisit(visitorProfile: UserProfile, myGender?: Gender) {
    try {
      const filtered = visitors.filter((v) => v.id !== visitorProfile.id);
      const newVisitor: Visitor = { ...visitorProfile, visitedAt: Date.now() };
      const updated = [newVisitor, ...filtered];
      await saveVisitors(updated);
    } catch (e) { console.error("Visit record error", e); }
  }

  async function addPost(post: Omit<Post, "id" | "comments" | "likes" | "createdAt" | "likedBy" | "commentedBy" | "isPopular">) {
    try {
      await addDoc(collection(db, "posts"), {
        userId: post.userId,
        nickname: post.nickname,
        profilePhoto: post.profilePhoto || "", 
        gender: post.gender,
        language: post.language,
        content: post.content,
        photo: post.photo || "", 
        voiceUrl: post.voiceUrl || "", 
        comments: [],
        commentedBy: [],
        likes: 0,
        likedBy: [],
        isPopular: false,
        createdAt: Date.now(),
      });
    } catch (e) {
      console.error("Firebase AddPost Error:", e);
      Alert.alert("알림", "게시글을 저장하지 못했습니다.");
    }
  }

  async function addComment(postId: string, comment: Omit<PostComment, "id" | "createdAt">) {
    try {
      const postRef = doc(db, "posts", postId);
      const newComment: PostComment = { ...comment, id: makeId(), createdAt: Date.now() };
      await updateDoc(postRef, {
        comments: arrayUnion(newComment),
        commentedBy: arrayUnion(comment.userId)
      });
    } catch (e) {
      console.error("Firebase AddComment Error:", e);
    }
  }

  async function likePost(postId: string, userId: string) {
    const post = posts.find(p => p.id === postId);
    if (!post) return;
    if (post.likedBy?.includes(userId)) {
      Alert.alert("알림", "이미 좋아요를 누른 게시글입니다.");
      return;
    }
    try {
      const postRef = doc(db, "posts", postId);
      await updateDoc(postRef, {
        likedBy: arrayUnion(userId),
        likes: increment(1)
      });
    } catch (e) {
      console.error("Firebase LikePost Error:", e);
    }
  }

  function subscribeToMessages(conversationId: string, callback: (messages: Message[]) => void) {
    const q = query(
      collection(db, "chats", conversationId, "messages"),
      orderBy("createdAt", "asc")
    );
    return onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as Message[];
      callback(msgs);
    });
  }

  const value = useMemo(() => ({
    conversations, posts, visitors, matchHistories,
    addConversation, sendMessage, unlockVoice,
    blockFriend, unblockFriend, removeFriend,
    addPost, addComment, likePost, recordVisit,
    refreshConversations, refreshPosts, refreshVisitors,
    subscribeToMessages,
    addMatchHistory, unlockMatchHistory, // ✅ 추가
  }), [conversations, posts, visitors, matchHistories]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}