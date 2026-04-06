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
import { Gender, useAuth } from "./AuthContext";

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
  getDocs,
  setDoc,
  where,
} from "firebase/firestore";

type FriendSource = "paid" | "mutual_heart" | "female_free";

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
  lastUpdated?: number;
  lastMessage?: string;
  isBlocked?: boolean;
  isMessageUnlocked: boolean;
  isVoiceUnlocked: boolean;
  isFriend: boolean;
  friendSource?: FriendSource | null;
  unreadCount: number;
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
  matchHistories: MatchHistory[];
  addConversation: (
    matchedUser: UserProfile,
    options?: {
      messageUnlocked?: boolean;
      voiceUnlocked?: boolean;
      isFriend?: boolean;
      friendSource?: FriendSource;
      myUserId?: string;
    }
  ) => Promise<Conversation>;
  sendMessage: (
    conversationId: string,
    senderId: string,
    text: string,
    type?: "text" | "call" | "missed_call"
  ) => Promise<void>;
  subscribeToMessages: (
    conversationId: string,
    callback: (messages: Message[]) => void
  ) => () => void;
  unlockVoice: (conversationId: string) => Promise<void>;
  markConversationAsFriend: (
    conversationId: string,
    source: FriendSource
  ) => Promise<void>;
  markConversationAsRead: (conversationId: string) => Promise<void>;
  blockFriend: (conversationId: string) => Promise<void>;
  unblockFriend: (conversationId: string) => Promise<void>;
  removeFriend: (conversationId: string) => Promise<void>;
  addPost: (
    post: Omit<
      Post,
      "id" | "comments" | "likes" | "createdAt" | "likedBy" | "commentedBy" | "isPopular"
    >
  ) => Promise<void>;
  addComment: (
    postId: string,
    comment: Omit<PostComment, "id" | "createdAt">
  ) => Promise<void>;
  likePost: (postId: string, userId: string) => Promise<void>;
  recordVisit: (visitorProfile: UserProfile, myGender?: Gender) => Promise<void>;
  refreshConversations: () => Promise<void>;
  refreshPosts: () => Promise<void>;
  refreshVisitors: () => Promise<void>;
  addMatchHistory: (profile: UserProfile) => Promise<void>;
  unlockMatchHistory: (id: string) => Promise<boolean>;
}

const DataContext = createContext<DataContextValue | null>(null);

const VISITORS_KEY = "@nighton_visitors";
const MATCH_HISTORY_KEY = "@nighton_match_histories";

function getConvosKey(uid: string) {
  return `@nighton_conversations_${uid}`;
}

function makeId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

function makeConvoId(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join("_");
}

function normalizeUserProfile(raw: any, fallbackId: string): UserProfile {
  return {
    id: raw?.id || fallbackId,
    nickname: raw?.nickname || "User",
    gender: raw?.gender || "male",
    age: Number(raw?.age ?? 25),
    language: (raw?.language || "ko") as Language,
    location: raw?.location || "",
    distanceKm: Number(raw?.distanceKm ?? 0),
    profilePhoto: raw?.profilePhoto || "",
    voiceIntroUrl: raw?.voiceIntroUrl || "",
    isOnline: Boolean(raw?.isOnline),
    fcmToken: raw?.fcmToken || raw?.TargetToken || "",
  };
}

function normalizeFriendSource(value: any): FriendSource | null {
  return value === "paid" ||
    value === "mutual_heart" ||
    value === "female_free"
    ? value
    : null;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { user, isLoading: isAuthLoading } = useAuth();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [matchHistories, setMatchHistories] = useState<MatchHistory[]>([]);

  function getCurrentUserChatProfile(): UserProfile | null {
    if (!user?.id) return null;

    return {
      id: user.id,
      nickname: user.nickname || "User",
      gender: (user.gender || "male") as Gender,
      age: Number(user.age ?? 25),
      language: (user.language || "ko") as Language,
      location: user.location || "",
      distanceKm: 0,
      profilePhoto: user.profilePhoto || "",
      voiceIntroUrl: user.voiceIntroUrl || "",
      isOnline: true,
      fcmToken: user.fcmToken || "",
    };
  }

  async function buildConversationFromChatDoc(
    chatId: string,
    chatData: any
  ): Promise<Conversation | null> {
    if (!user?.id) return null;

    const participants: string[] = Array.isArray(chatData?.participants)
      ? chatData.participants
      : [];

    const otherUserId = participants.find((id) => id !== user.id);
    if (!otherUserId) return null;

    const participantProfiles = chatData?.participantProfiles || {};
    let matchedUser = normalizeUserProfile(
      participantProfiles[otherUserId],
      otherUserId
    );

    try {
      const userSnap = await getDoc(doc(db, "users", otherUserId));
      if (userSnap.exists()) {
        const latest = userSnap.data();
        matchedUser = {
          ...matchedUser,
          nickname: latest.nickname || matchedUser.nickname,
          gender: latest.gender || matchedUser.gender,
          age: Number(latest.age ?? matchedUser.age),
          language: (latest.language || matchedUser.language) as Language,
          location: latest.location || matchedUser.location,
          profilePhoto: latest.profilePhoto || matchedUser.profilePhoto,
          voiceIntroUrl: latest.voiceIntroUrl || matchedUser.voiceIntroUrl,
          isOnline: Boolean(latest.isOnline ?? matchedUser.isOnline),
          fcmToken: latest.fcmToken || latest.TargetToken || matchedUser.fcmToken,
        };
      }
    } catch (e) {
      console.log("matched user 최신 프로필 조회 실패:", e);
    }

    const blockedBy = Array.isArray(chatData?.blockedBy) ? chatData.blockedBy : [];
    const unreadCountByUser =
      chatData?.unreadCountByUser && typeof chatData.unreadCountByUser === "object"
        ? chatData.unreadCountByUser
        : {};

    return {
      id: chatId,
      matchedUserId: otherUserId,
      matchedUser,
      messages: [],
      createdAt: Number(chatData?.createdAt ?? Date.now()),
      lastUpdated: Number(chatData?.lastUpdated ?? chatData?.createdAt ?? Date.now()),
      lastMessage: chatData?.lastMessage || "",
      isBlocked: blockedBy.includes(user.id),
      isMessageUnlocked: Boolean(chatData?.isMessageUnlocked),
      isVoiceUnlocked: Boolean(chatData?.isVoiceUnlocked),
      isFriend: Boolean(chatData?.isFriend),
      friendSource: normalizeFriendSource(chatData?.friendSource),
      unreadCount: Number(unreadCountByUser?.[user.id] ?? 0),
    };
  }

  async function cacheConversations(next: Conversation[]) {
    if (!user?.id) {
      setConversations(next);
      return;
    }
    await AsyncStorage.setItem(getConvosKey(user.id), JSON.stringify(next));
    setConversations(next);
  }

  async function loadConversationsOnce() {
    if (!user?.id) return [];

    const q = query(
      collection(db, "chats"),
      where("participants", "array-contains", user.id)
    );
    const snap = await getDocs(q);

    const mapped = (
      await Promise.all(
        snap.docs.map((chatDoc) =>
          buildConversationFromChatDoc(chatDoc.id, chatDoc.data())
        )
      )
    ).filter(Boolean) as Conversation[];

    mapped.sort(
      (a, b) => Number(b.lastUpdated ?? 0) - Number(a.lastUpdated ?? 0)
    );

    await cacheConversations(mapped);
    return mapped;
  }

  useEffect(() => {
    let unsubscribePosts: (() => void) | null = null;
    let unsubscribeChats: (() => void) | null = null;
    let isMounted = true;

    const bootstrap = async () => {
      if (isAuthLoading) return;

      if (!user?.id) {
        if (!isMounted) return;
        setPosts([]);
        setConversations([]);
        setVisitors([]);
        setMatchHistories([]);
        return;
      }

      try {
        const cached = await AsyncStorage.getItem(getConvosKey(user.id));
        if (cached && isMounted) {
          setConversations(JSON.parse(cached));
        }
      } catch (e) {
        console.log("conversation cache load 실패:", e);
      }

      await refreshVisitors();
      await refreshMatchHistories();

      const postsQ = query(collection(db, "posts"), orderBy("createdAt", "desc"));
      unsubscribePosts = onSnapshot(
        postsQ,
        (snapshot) => {
          if (!isMounted) return;

          const fetchedPosts = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          })) as Post[];

          setPosts(fetchedPosts);
        },
        (error) => {
          console.error("Firestore posts listener error:", error);
        }
      );

      const chatsQ = query(
        collection(db, "chats"),
        where("participants", "array-contains", user.id)
      );

      unsubscribeChats = onSnapshot(
        chatsQ,
        async (snapshot) => {
          if (!isMounted) return;

          try {
            const next = (
              await Promise.all(
                snapshot.docs.map((chatDoc) =>
                  buildConversationFromChatDoc(chatDoc.id, chatDoc.data())
                )
              )
            ).filter(Boolean) as Conversation[];

            next.sort(
              (a, b) => Number(b.lastUpdated ?? 0) - Number(a.lastUpdated ?? 0)
            );

            await AsyncStorage.setItem(
              getConvosKey(user.id!),
              JSON.stringify(next)
            );

            if (isMounted) setConversations(next);
          } catch (e) {
            console.error("chat listener mapping error:", e);
          }
        },
        (error) => {
          console.error("Firestore chats listener error:", error);
        }
      );
    };

    bootstrap();

    return () => {
      isMounted = false;
      if (unsubscribePosts) unsubscribePosts();
      if (unsubscribeChats) unsubscribeChats();
    };
  }, [isAuthLoading, user?.id]);

  async function refreshConversations() {
    if (!user?.id) return;

    try {
      await loadConversationsOnce();
    } catch (e) {
      console.error("refreshConversations Error:", e);
    }
  }

  async function refreshPosts() {
    if (!user?.id) return;
  }

  async function refreshVisitors() {
    if (!user?.id) return;

    try {
      const stored = await AsyncStorage.getItem(VISITORS_KEY);
      if (stored) {
        setVisitors(JSON.parse(stored));
      } else {
        setVisitors([]);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function refreshMatchHistories() {
    if (!user?.id) return;

    try {
      const stored = await AsyncStorage.getItem(MATCH_HISTORY_KEY);
      if (stored) {
        setMatchHistories(JSON.parse(stored));
      } else {
        setMatchHistories([]);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function saveVisitors(v: Visitor[]) {
    await AsyncStorage.setItem(VISITORS_KEY, JSON.stringify(v));
    setVisitors(v);
  }

  async function addConversation(
    matchedUser: UserProfile,
    options?: {
      messageUnlocked?: boolean;
      voiceUnlocked?: boolean;
      isFriend?: boolean;
      friendSource?: FriendSource;
      myUserId?: string;
    }
  ): Promise<Conversation> {
    if (!user?.id) {
      throw new Error("로그인 후 다시 시도해주세요.");
    }

    const myId = options?.myUserId || user.id;
    const convoId = makeConvoId(myId, matchedUser.id);
    const chatRef = doc(db, "chats", convoId);

    let latestFCMToken = matchedUser.fcmToken;

    try {
      const userRef = doc(db, "users", matchedUser.id);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        latestFCMToken = data.fcmToken || data.TargetToken || latestFCMToken;
      }
    } catch (err) {
      console.warn("최신 토큰 조회 실패", err);
    }

    const updatedMatchedUser: UserProfile = {
      ...matchedUser,
      fcmToken: latestFCMToken,
    };

    const myProfile = getCurrentUserChatProfile();
    if (!myProfile) {
      throw new Error("현재 유저 프로필을 찾을 수 없습니다.");
    }

    const existingSnap = await getDoc(chatRef);
    const existingData = existingSnap.exists() ? existingSnap.data() : {};

    const nextIsFriend =
      typeof options?.isFriend === "boolean"
        ? options.isFriend
        : Boolean(existingData?.isFriend);

    const nextFriendSource = nextIsFriend
      ? options?.friendSource || normalizeFriendSource(existingData?.friendSource)
      : null;

    const unreadCountByUser = {
      ...(existingData?.unreadCountByUser || {}),
      [myId]: Number(existingData?.unreadCountByUser?.[myId] ?? 0),
      [matchedUser.id]: Number(existingData?.unreadCountByUser?.[matchedUser.id] ?? 0),
    };

    const payload = {
      conversationId: convoId,
      participants: [myId, matchedUser.id].sort(),
      participantProfiles: {
        ...(existingData?.participantProfiles || {}),
        [myId]: {
          ...myProfile,
          isOnline: true,
        },
        [matchedUser.id]: {
          ...(existingData?.participantProfiles?.[matchedUser.id] || {}),
          ...updatedMatchedUser,
        },
      },
      createdAt: Number(existingData?.createdAt ?? Date.now()),
      lastUpdated: Date.now(),
      lastMessage: existingData?.lastMessage || "",
      isMessageUnlocked:
        options?.messageUnlocked ?? Boolean(existingData?.isMessageUnlocked),
      isVoiceUnlocked:
        options?.voiceUnlocked ?? Boolean(existingData?.isVoiceUnlocked),
      isFriend: nextIsFriend,
      friendSource: nextFriendSource,
      blockedBy: Array.isArray(existingData?.blockedBy) ? existingData.blockedBy : [],
      unreadCountByUser,
    };

    await setDoc(chatRef, payload, { merge: true });
    await refreshConversations();

    return {
      id: convoId,
      matchedUserId: updatedMatchedUser.id,
      matchedUser: updatedMatchedUser,
      messages: [],
      createdAt: payload.createdAt,
      lastUpdated: payload.lastUpdated,
      lastMessage: payload.lastMessage,
      isBlocked: payload.blockedBy.includes(user.id),
      isMessageUnlocked: payload.isMessageUnlocked,
      isVoiceUnlocked: payload.isVoiceUnlocked,
      isFriend: payload.isFriend,
      friendSource: payload.friendSource,
      unreadCount: Number(payload.unreadCountByUser?.[user.id] ?? 0),
    };
  }

  async function sendMessage(
    conversationId: string,
    senderId: string,
    text: string,
    type: "text" | "call" | "missed_call" = "text"
  ) {
    if (!user?.id) {
      throw new Error("로그인 후 다시 시도해주세요.");
    }

    const msg: Message = {
      id: makeId(),
      senderId,
      text,
      createdAt: Date.now(),
      type,
    };

    try {
      await addDoc(collection(db, "chats", conversationId, "messages"), msg);

      const chatRef = doc(db, "chats", conversationId);
      const chatSnap = await getDoc(chatRef);
      const existingData = chatSnap.exists() ? chatSnap.data() : {};

      const participants: string[] = Array.isArray(existingData?.participants)
        ? existingData.participants
        : [user.id];

      const unreadCountByUser = {
        ...(existingData?.unreadCountByUser || {}),
      };

      participants.forEach((participantId) => {
        if (participantId === senderId) {
          unreadCountByUser[participantId] = 0;
        } else {
          unreadCountByUser[participantId] =
            Number(unreadCountByUser[participantId] ?? 0) + 1;
        }
      });

      await setDoc(
        chatRef,
        {
          conversationId,
          participants,
          participantProfiles: existingData?.participantProfiles || {
            [user.id]: getCurrentUserChatProfile(),
          },
          lastMessage: text,
          lastUpdated: Date.now(),
          createdAt: Number(existingData?.createdAt ?? Date.now()),
          isMessageUnlocked: true,
          isVoiceUnlocked: Boolean(existingData?.isVoiceUnlocked),
          isFriend: Boolean(existingData?.isFriend),
          friendSource: normalizeFriendSource(existingData?.friendSource),
          blockedBy: Array.isArray(existingData?.blockedBy) ? existingData.blockedBy : [],
          unreadCountByUser,
        },
        { merge: true }
      );
    } catch (e) {
      console.error("Firestore 메시지 저장 실패:", e);
      throw e;
    }

    const updated = conversations.map((c) => {
      if (c.id !== conversationId) return c;
      return {
        ...c,
        messages: [...c.messages, msg],
        lastMessage: text,
        lastUpdated: Date.now(),
        isMessageUnlocked: true,
        unreadCount: senderId === user.id ? 0 : c.unreadCount,
      };
    });

    await cacheConversations(updated);
  }

  async function unlockVoice(conversationId: string) {
    await setDoc(
      doc(db, "chats", conversationId),
      {
        isVoiceUnlocked: true,
        lastUpdated: Date.now(),
      },
      { merge: true }
    );
    await refreshConversations();
  }

  async function markConversationAsFriend(
    conversationId: string,
    source: FriendSource
  ) {
    await setDoc(
      doc(db, "chats", conversationId),
      {
        isFriend: true,
        friendSource: source,
        lastUpdated: Date.now(),
      },
      { merge: true }
    );
    await refreshConversations();
  }

  async function markConversationAsRead(conversationId: string) {
    if (!user?.id) return;

    try {
      const chatRef = doc(db, "chats", conversationId);
      const snap = await getDoc(chatRef);
      if (!snap.exists()) return;

      const data = snap.data();
      const unreadCountByUser = {
        ...(data?.unreadCountByUser || {}),
        [user.id]: 0,
      };

      await setDoc(
        chatRef,
        {
          unreadCountByUser,
        },
        { merge: true }
      );

      const updated = conversations.map((c) =>
        c.id === conversationId ? { ...c, unreadCount: 0 } : c
      );
      await cacheConversations(updated);
    } catch (e) {
      console.error("markConversationAsRead Error:", e);
    }
  }

  async function addMatchHistory(profile: UserProfile) {
    if (!user?.id) return;

    try {
      const stored = await AsyncStorage.getItem(MATCH_HISTORY_KEY);
      const current: MatchHistory[] = stored ? JSON.parse(stored) : [];

      const exists = current.find((h) => h.profile.id === profile.id);
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

  async function unlockMatchHistory(id: string): Promise<boolean> {
    if (!user?.id) return false;

    try {
      const stored = await AsyncStorage.getItem(MATCH_HISTORY_KEY);
      const current: MatchHistory[] = stored ? JSON.parse(stored) : [];
      const updated = current.map((h) =>
        h.id === id ? { ...h, isUnlocked: true } : h
      );
      await AsyncStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(updated));
      setMatchHistories(updated);
      return true;
    } catch (e) {
      console.error("match history unlock 실패:", e);
      return false;
    }
  }

  async function blockFriend(conversationId: string) {
    if (!user?.id) return;

    await setDoc(
      doc(db, "chats", conversationId),
      {
        blockedBy: arrayUnion(user.id),
        lastUpdated: Date.now(),
      },
      { merge: true }
    );

    await refreshConversations();
  }

  async function unblockFriend(conversationId: string) {
    if (!user?.id) return;

    const chatRef = doc(db, "chats", conversationId);
    const snap = await getDoc(chatRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const blockedBy = Array.isArray(data?.blockedBy) ? data.blockedBy : [];
    const nextBlockedBy = blockedBy.filter((id: string) => id !== user.id);

    await setDoc(
      chatRef,
      {
        blockedBy: nextBlockedBy,
        lastUpdated: Date.now(),
      },
      { merge: true }
    );

    await refreshConversations();
  }

  async function removeFriend(conversationId: string) {
    await setDoc(
      doc(db, "chats", conversationId),
      {
        isFriend: false,
        friendSource: null,
        isVoiceUnlocked: false,
        lastUpdated: Date.now(),
      },
      { merge: true }
    );
    await refreshConversations();
  }

  async function recordVisit(visitorProfile: UserProfile, myGender?: Gender) {
    if (!user?.id) return;

    try {
      const filtered = visitors.filter((v) => v.id !== visitorProfile.id);
      const newVisitor: Visitor = { ...visitorProfile, visitedAt: Date.now() };
      const updated = [newVisitor, ...filtered];
      await saveVisitors(updated);
    } catch (e) {
      console.error("Visit record error", e);
    }
  }

  async function addPost(
    post: Omit<
      Post,
      "id" | "comments" | "likes" | "createdAt" | "likedBy" | "commentedBy" | "isPopular"
    >
  ) {
    if (!user?.id) {
      Alert.alert("알림", "로그인 후 이용해주세요.");
      return;
    }

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

  async function addComment(
    postId: string,
    comment: Omit<PostComment, "id" | "createdAt">
  ) {
    if (!user?.id) {
      Alert.alert("알림", "로그인 후 이용해주세요.");
      return;
    }

    try {
      const postRef = doc(db, "posts", postId);
      const newComment: PostComment = {
        ...comment,
        id: makeId(),
        createdAt: Date.now(),
      };
      await updateDoc(postRef, {
        comments: arrayUnion(newComment),
        commentedBy: arrayUnion(comment.userId),
      });
    } catch (e) {
      console.error("Firebase AddComment Error:", e);
    }
  }

  async function likePost(postId: string, userId: string) {
    if (!user?.id) {
      Alert.alert("알림", "로그인 후 이용해주세요.");
      return;
    }

    const post = posts.find((p) => p.id === postId);
    if (!post) return;

    if (post.likedBy?.includes(userId)) {
      Alert.alert("알림", "이미 좋아요를 누른 게시글입니다.");
      return;
    }

    try {
      const postRef = doc(db, "posts", postId);
      await updateDoc(postRef, {
        likedBy: arrayUnion(userId),
        likes: increment(1),
      });
    } catch (e) {
      console.error("Firebase LikePost Error:", e);
    }
  }

  function subscribeToMessages(
    conversationId: string,
    callback: (messages: Message[]) => void
  ) {
    if (!user?.id) {
      return () => {};
    }

    const q = query(
      collection(db, "chats", conversationId, "messages"),
      orderBy("createdAt", "asc")
    );

    return onSnapshot(
      q,
      (snapshot) => {
        const msgs = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as Message[];
        callback(msgs);
      },
      (error) => {
        console.error("subscribeToMessages Error:", error);
      }
    );
  }

  const value = useMemo(
    () => ({
      conversations,
      posts,
      visitors,
      matchHistories,
      addConversation,
      sendMessage,
      subscribeToMessages,
      unlockVoice,
      markConversationAsFriend,
      markConversationAsRead,
      blockFriend,
      unblockFriend,
      removeFriend,
      addPost,
      addComment,
      likePost,
      recordVisit,
      refreshConversations,
      refreshPosts,
      refreshVisitors,
      addMatchHistory,
      unlockMatchHistory,
    }),
    [conversations, posts, visitors, matchHistories, user?.id, isAuthLoading]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}