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

// ✅ Firebase 임포트
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
} from "firebase/firestore";

export interface FakeProfile {
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
  // ✅ 필드명 주의: DB 저장명과 일치시켜야 함 (fcmToken 추천)
  fcmToken?: string; 
}

export interface Visitor extends FakeProfile {
  visitedAt: number;
}

export interface Message {
  id: string;
  senderId: string;
  text: string;
  createdAt: number;
}

export interface Conversation {
  id: string;
  matchedUserId: string;
  matchedUser: FakeProfile;
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
  addConversation: (
    matchedUser: FakeProfile, 
    options?: { messageUnlocked?: boolean; voiceUnlocked?: boolean; isFriend?: boolean }
  ) => Promise<Conversation>;
  sendMessage: (conversationId: string, senderId: string, text: string) => Promise<void>;
  unlockVoice: (conversationId: string) => Promise<void>;
  blockFriend: (conversationId: string) => Promise<void>;
  unblockFriend: (conversationId: string) => Promise<void>;
  removeFriend: (conversationId: string) => Promise<void>;
  addPost: (post: Omit<Post, "id" | "comments" | "likes" | "createdAt" | "likedBy" | "commentedBy" | "isPopular">) => Promise<void>;
  addComment: (postId: string, comment: Omit<PostComment, "id" | "createdAt">) => Promise<void>;
  likePost: (postId: string, userId: string) => Promise<void>;
  recordVisit: (visitorProfile: FakeProfile, myGender?: Gender) => Promise<void>;
  refreshConversations: () => Promise<void>;
  refreshPosts: () => Promise<void>;
  refreshVisitors: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

const CONVOS_KEY = "@nighton_conversations";
const VISITORS_KEY = "@nighton_visitors";

function makeId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);

  useEffect(() => {
    refreshConversations();
    refreshVisitors();

    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedPosts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Post[];

      if (fetchedPosts.length === 0) {
        // 초기 데이터 로딩 생략 가능 (필요시 호출)
      } else {
        setPosts(fetchedPosts);
      }
    }, (error) => {
      console.error("Firestore Listener Error:", error);
    });

    return () => unsubscribe();
  }, []);

  // ✅ [수정] 대화 목록을 불러올 때 상대방의 FCM 토큰을 확실히 가져옴
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
                // DB 필드가 fcmToken이든 TargetToken이든 둘 다 대응하도록 수정
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

  async function saveConversations(convos: Conversation[]) {
    await AsyncStorage.setItem(CONVOS_KEY, JSON.stringify(convos));
    setConversations(convos);
  }

  async function saveVisitors(v: Visitor[]) {
    await AsyncStorage.setItem(VISITORS_KEY, JSON.stringify(v));
    setVisitors(v);
  }

  // ✅ [수정] 대화 시작 시 상대방의 최신 토큰을 다시 한번 강제로 긁어옴
  async function addConversation(
    matchedUser: FakeProfile,
    options?: { messageUnlocked?: boolean; voiceUnlocked?: boolean; isFriend?: boolean }
  ): Promise<Conversation> {

    let latestFCMToken = matchedUser.fcmToken;
    try {
      const userRef = doc(db, "users", matchedUser.id);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        latestFCMToken = data.fcmToken || data.TargetToken; // 두 필드 모두 체크
        console.log("📡 [DataContext] 상대방 최신 토큰 확인됨:", !!latestFCMToken);
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

    const convo: Conversation = { 
      id: makeId(), 
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

  async function sendMessage(conversationId: string, senderId: string, text: string) {
    const msg: Message = { id: makeId(), senderId, text, createdAt: Date.now() };
    const updated = conversations.map((c) => {
      if (c.id !== conversationId) return c;
      return { ...c, messages: [...c.messages, msg], lastMessage: text, isMessageUnlocked: true };
    });
    await saveConversations(updated);
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

  async function recordVisit(visitorProfile: FakeProfile, myGender?: Gender) {
    try {
      const filtered = visitors.filter((v) => v.id !== visitorProfile.id);
      const newVisitor: Visitor = {
        ...visitorProfile,
        visitedAt: Date.now(),
      };
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
      const newComment: PostComment = {
        ...comment,
        id: makeId(),
        createdAt: Date.now()
      };
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

  const value = useMemo(() => ({
    conversations, posts, visitors,
    addConversation, sendMessage, unlockVoice,
    blockFriend, unblockFriend, removeFriend,
    addPost, addComment, likePost, recordVisit,
    refreshConversations, refreshPosts, refreshVisitors,
  }), [conversations, posts, visitors]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}