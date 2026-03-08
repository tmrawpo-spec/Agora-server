import React from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  Platform,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";

const { width, height } = Dimensions.get("window");

export default function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { loginWithGoogle, signUp, signIn } = useAuth(); 

  const [isLoginMode, setIsLoginMode] = React.useState(false); 
  const [loading, setLoading] = React.useState<"google" | "email" | null>(null);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirmPassword, setConfirmPassword] = React.useState("");

  const topPad = Platform.OS === "web" ? 40 : insets.top + 20;
  const botPad = Platform.OS === "web" ? 20 : insets.bottom + 10;

  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(0.6);

  React.useEffect(() => {
    glowScale.value = withRepeat(withTiming(1.15, { duration: 2500 }), -1, true);
    glowOpacity.value = withRepeat(withTiming(1, { duration: 2500 }), -1, true);
  }, []);

  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));

  const handleEmailAction = async () => {
    if (!email || !password) {
      Alert.alert("알림", "정보를 모두 입력해주세요.");
      return;
    }

    setLoading("email");
    try {
      if (isLoginMode) {
        // --- 로그인 모드 ---
        await signIn(email, password);
        // AuthContext의 signIn 내부에서 인증 여부에 따라 자동으로 화면을 이동시킵니다.
      } else {
        // --- 회원가입 모드 ---
        if (password !== confirmPassword) {
          Alert.alert("오류", "비밀번호가 일치하지 않습니다.");
          return;
        }
        if (password.length < 6) {
          Alert.alert("알림", "비밀번호는 최소 6자 이상이어야 합니다.");
          return;
        }

        // [수정 완료] 이제 signUp 함수만 호출합니다. 
        // 화면 이동(verify-email로 이동)은 AuthContext.tsx의 signUp 함수가 담당합니다.
        await signUp(email, password);
      }
    } catch (error: any) {
      console.error("인증 에러:", error);
      let errorMessage = "인증에 실패했습니다.";

      // 상세 에러 메시지 처리
      if (error.code === 'auth/email-already-in-use') errorMessage = "이미 가입된 이메일입니다.";
      else if (error.code === 'auth/invalid-email') errorMessage = "이메일 형식이 올바르지 않습니다.";
      else if (error.code === 'auth/weak-password') errorMessage = "비밀번호가 너무 취약합니다.";
      else if (error.code === 'auth/network-request-failed') errorMessage = "네트워크 연결이 원활하지 않습니다.";
      else if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') errorMessage = "이메일 또는 비밀번호를 확인해주세요.";

      Alert.alert("알림", errorMessage);
    } finally {
      setLoading(null);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading("google");
    try {
      await loginWithGoogle();
    } catch (error) {
      console.log("로그인 실패 또는 취소:", error);
    } finally {
      setLoading(null);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      style={{ flex: 1 }}
    >
      <View style={[styles.container, { paddingTop: topPad, paddingBottom: botPad }]}>
        <LinearGradient
          colors={["#0d0d12", "#1a1a1f", "#1a1220"]}
          style={StyleSheet.absoluteFill}
        />

        <ScrollView 
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          <View style={styles.moonContainer}>
            <Animated.View style={[styles.glowRing, glowStyle]} />
            <View style={styles.moon}>
              <LinearGradient
                colors={["#f5c842", "#e8a020", "#c07000"]}
                style={styles.moonGradient}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 1, y: 1 }}
              />
              <View style={styles.moonShadow} />
            </View>
          </View>

          <View style={styles.hero}>
            <Text style={styles.appName}>NightOn</Text>
            <Text style={styles.tagline}>Connect. Talk. Discover.</Text>
            <Text style={styles.subtitle}>
              Random voice matches with real people.{"\n"}7 minutes to find a connection.
            </Text>
          </View>

          <View style={styles.actions}>
            <View style={{ gap: 8 }}>
              <TextInput
                style={styles.authInput}
                placeholder="Email"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
              />
              <TextInput
                style={styles.authInput}
                placeholder="Password"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />

              {!isLoginMode && (
                <TextInput
                  style={styles.authInput}
                  placeholder="Confirm Password"
                  placeholderTextColor={Colors.textMuted}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry
                />
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.socialBtn,
                  { marginTop: 4, opacity: (pressed || loading === "email") ? 0.7 : 1 },
                ]}
                onPress={handleEmailAction}
                disabled={loading !== null}
              >
                <Text style={styles.socialBtnText}>
                  {loading === "email" 
                    ? (isLoginMode ? "Signing In..." : "Creating Account...") 
                    : (isLoginMode ? "Sign In" : "Create Account")}
                </Text>
              </Pressable>

              <Pressable 
                onPress={() => {
                  setIsLoginMode(!isLoginMode);
                  setConfirmPassword(""); 
                }} 
                style={styles.toggleBtn}
              >
                <Text style={styles.toggleText}>
                  {isLoginMode 
                    ? "Don't have an account? Sign Up" 
                    : "Already have an account? Sign In"}
                </Text>
              </Pressable>
            </View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Pressable
              style={({ pressed }) => [
                styles.googleBtn,
                { opacity: (pressed || loading === "google") ? 0.7 : 1 },
              ]}
              onPress={handleGoogleLogin}
              disabled={loading !== null}
            >
              <View style={styles.btnInner}>
                <Ionicons name="logo-google" size={20} color="#fff" />
                <Text style={styles.socialBtnText}>
                   {loading === "google" ? "Connecting..." : "Continue with Google"}
                </Text>
              </View>
            </Pressable>

            <Text style={styles.terms}>
              By continuing, you agree to our Terms & Privacy.{"\n"}
              Users must be 19 years or older.
            </Text>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { alignItems: "center", paddingHorizontal: 24, paddingBottom: 20 },
  moonContainer: { marginTop: 20, alignItems: "center", justifyContent: "center", width: 140, height: 140 },
  glowRing: { position: "absolute", width: 140, height: 140, borderRadius: 70, backgroundColor: "rgba(245, 200, 66, 0.12)" },
  moon: { width: 90, height: 90, borderRadius: 45, overflow: "hidden" },
  moonGradient: { width: 90, height: 90 },
  moonShadow: { position: "absolute", right: -8, top: -8, width: 80, height: 80, borderRadius: 40, backgroundColor: "#0d0d12" },
  hero: { alignItems: "center", gap: 6, marginVertical: 15 },
  appName: { fontSize: 40, fontFamily: "Nunito_800ExtraBold", color: Colors.textPrimary, letterSpacing: -1 },
  tagline: { fontSize: 14, fontFamily: "Nunito_600SemiBold", color: Colors.accent, letterSpacing: 2, textTransform: "uppercase" },
  subtitle: { fontSize: 14, fontFamily: "Nunito_400Regular", color: Colors.textSecondary, textAlign: "center", lineHeight: 20, marginTop: 4 },
  actions: { width: "100%", gap: 12 },
  authInput: { backgroundColor: "rgba(255, 255, 255, 0.05)", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.1)", borderRadius: 12, height: 52, paddingHorizontal: 16, color: "#fff", fontSize: 15 },
  socialBtn: { backgroundColor: Colors.accent, borderRadius: 12, height: 52, justifyContent: "center", alignItems: "center" },
  socialBtnText: { color: "#fff", fontFamily: "Nunito_700Bold", fontSize: 15 },
  toggleBtn: { marginTop: 4, padding: 8 },
  toggleText: { color: Colors.textSecondary, textAlign: 'center', fontFamily: 'Nunito_600SemiBold', fontSize: 13, opacity: 0.8 },
  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: 4 },
  dividerLine: { flex: 1, height: 1, backgroundColor: "rgba(255, 255, 255, 0.1)" },
  dividerText: { color: Colors.textMuted, fontSize: 13, fontFamily: "Nunito_600SemiBold" },
  googleBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: "rgba(255, 255, 255, 0.2)", borderRadius: 12, height: 52, justifyContent: "center", alignItems: "center" },
  btnInner: { flexDirection: "row", alignItems: "center", gap: 10 },
  terms: { textAlign: "center", color: Colors.textMuted, fontFamily: "Nunito_400Regular", fontSize: 11, lineHeight: 16, marginTop: 8 },
});