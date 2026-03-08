import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { BlurView } from "expo-blur";
import { doc, getDoc } from "firebase/firestore"; 
import { db } from "@/constants/firebase"; // ✅ 경로가 다르면 수정하세요 (예: ../constants/firebase)

interface Props {
  callerName: string;
  callerId: string;    
  convoId: string;     
  callerPhoto?: string;
  // ✅ 핵심: 이 부분이 (token: string) => void 형태여야 Layout의 빨간줄이 사라집니다.
  onAccept: (callerToken: string) => void; 
  onReject: () => void;
}

export function IncomingCallModal({ callerName, callerId, convoId, callerPhoto, onAccept, onReject }: Props) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleAcceptPress = async () => {
    if (isConnecting) return;
    setIsConnecting(true);

    try {
      console.log(`📡 [Modal] 발신자(${callerName}) 토큰 조회 중...`);
      
      // 1. DB에서 발신자의 토큰을 직접 가져옴
      const userRef = doc(db, "users", callerId);
      const snap = await getDoc(userRef);

      if (snap.exists()) {
        const callerData = snap.data();
        const callerToken = callerData.fcmToken;

        if (callerToken) {
          console.log("✅ [Modal] 토큰 확보 성공!");
          // 2. 확보한 토큰을 부모(Layout)의 onAccept로 넘겨줌
          onAccept(callerToken);
        } else {
          Alert.alert("연결 오류", "상대방의 연결 정보(FCM)가 없습니다.");
          onReject();
        }
      } else {
        onReject();
      }
    } catch (error) {
      console.error("❌ [Modal] 에러:", error);
      setIsConnecting(false);
    }
  };

  return (
    <View style={styles.wrapper}>
      <BlurView intensity={90} tint="dark" style={styles.container}>
        <View style={styles.content}>
          <Image 
            source={{ uri: callerPhoto || "https://via.placeholder.com/100" }} 
            style={styles.avatar} 
          />
          <View style={styles.info}>
            <Text style={styles.label}>전화 오는 중...</Text>
            <Text style={styles.name}>{callerName}</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <Pressable style={[styles.btn, styles.reject]} onPress={onReject} disabled={isConnecting}>
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          
          <Pressable style={[styles.btn, styles.accept]} onPress={handleAcceptPress} disabled={isConnecting}>
            {isConnecting ? <ActivityIndicator color="#fff" /> : <Ionicons name="call" size={24} color="#fff" />}
          </Pressable>
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', top: 60, left: 16, right: 16, zIndex: 9999 },
  container: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderRadius: 24, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  content: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  info: { gap: 2 },
  label: { fontSize: 12, color: 'rgba(255,255,255,0.6)' },
  name: { fontSize: 18, fontWeight: '700', color: '#fff' },
  actions: { flexDirection: 'row', gap: 12 },
  btn: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  reject: { backgroundColor: '#ff3b30' },
  accept: { backgroundColor: '#34c759' },
});