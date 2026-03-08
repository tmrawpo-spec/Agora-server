import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Alert, ActivityIndicator } from "react-native";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

export default function VerifyEmailScreen() {
  const { user, logout, checkEmailVerified } = useAuth();
  const [checking, setChecking] = useState(false);

  const handleCheckStatus = async () => {
    setChecking(true);
    try {
      const isVerified = await checkEmailVerified(); 

      if (isVerified) {
        Alert.alert("인증 성공", "이메일 인증이 완료되었습니다!", [
          { 
            text: "확인", 
            onPress: () => router.replace("/(auth)/profile-setup") 
          }
        ]);
      } else {
        Alert.alert(
          "인증 미완료", 
          "아직 메일에서 인증 링크를 클릭하지 않으셨습니다. 메일함을 다시 확인해 주세요."
        );
      }
    } catch (error) {
      Alert.alert("오류", "상태 확인 중 문제가 발생했습니다.");
    } finally {
      setChecking(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="mail-open-outline" size={80} color={Colors.accent} />
      </View>

      <Text style={styles.title}>이메일을 확인해주세요!</Text>
      <Text style={styles.subtitle}>
        입력하신 이메일로 인증 링크를 보냈습니다.{"\n"}링크 클릭 후 아래 버튼을 눌러주세요.
      </Text>

      {/* --- 스팸함 안내 문구 추가 --- */}
      <View style={styles.spamNotice}>
        <Ionicons name="alert-circle-outline" size={20} color="#f5c842" />
        <Text style={styles.spamNoticeText}>
          메일이 보이지 않는다면 <Text style={{fontWeight: 'bold', color: '#f5c842'}}>스팸 메일함</Text>을 꼭 확인해 주세요!
        </Text>
      </View>

      <View style={styles.buttonGroup}>
        <Pressable 
          style={({ pressed }) => [
            styles.primaryButton, 
            (pressed || checking) && { opacity: 0.8 }
          ]} 
          onPress={handleCheckStatus}
          disabled={checking}
        >
          {checking ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>인증 완료했습니다</Text>
          )}
        </Pressable>

        <Pressable style={styles.logoutButton} onPress={logout}>
          <Text style={styles.logoutText}>다른 계정으로 로그인 (로그아웃)</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: "#0d0d12", 
    alignItems: "center", 
    justifyContent: "center", 
    padding: 30 
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: { 
    fontSize: 26, 
    fontWeight: "bold", 
    color: "#fff", 
    marginBottom: 12 
  },
  subtitle: { 
    fontSize: 16, 
    color: "#ccc", 
    textAlign: "center", 
    lineHeight: 24,
    marginBottom: 20 // 문구 추가를 위해 간격 조절
  },
  spamNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(245, 200, 66, 0.1)',
    padding: 12,
    borderRadius: 12,
    marginBottom: 40,
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(245, 200, 66, 0.2)',
  },
  spamNoticeText: {
    color: "#eee",
    fontSize: 13,
  },
  buttonGroup: {
    width: "100%",
    gap: 15,
  },
  primaryButton: { 
    backgroundColor: Colors.accent, 
    height: 56, 
    borderRadius: 16, 
    alignItems: "center", 
    justifyContent: "center" 
  },
  buttonText: { 
    color: "#fff", 
    fontSize: 18, 
    fontWeight: "bold" 
  },
  logoutButton: { 
    padding: 10,
    alignItems: "center"
  },
  logoutText: { 
    color: "#888", 
    fontSize: 14,
    textDecorationLine: "underline" 
  }
});