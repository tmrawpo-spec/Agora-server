import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  Alert,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth, Gender } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { Language, LANGUAGE_LABELS, t } from "@/constants/i18n";

export default function ProfileSetupScreen() {
  const insets = useSafeAreaInsets();
  const { user, updateProfile, logout } = useAuth();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [nickname, setNickname] = useState(user?.nickname || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [gender, setGender] = useState<Gender>(user?.gender || "male");
  const [age, setAge] = useState(String(user?.age || 25));
  const [language, setLanguage] = useState<Language>(user?.language || "en");
  const [location, setLocation] = useState(user?.location || "");
  const [profilePhoto, setProfilePhoto] = useState<string | undefined>(
    user?.profilePhoto,
  );
  const [locationGranted, setLocationGranted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const lang = language;
  const languages: Language[] = ["en", "ko", "ja", "es"];

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Please allow photo access.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      setProfilePhoto(result.assets[0].uri);
    }
  }

  async function requestLocation() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Permission denied", "Location access was denied.");
      return;
    }
    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const [geo] = await Location.reverseGeocodeAsync(loc.coords);
    const city = geo?.city || geo?.region || "Unknown";
    setLocation(city);
    setLocationGranted(true);
  }

  async function handleSave() {
    if (!nickname.trim()) {
      setError("Nickname is required");
      return;
    }
    const ageNum = parseInt(age, 10);
    if (isNaN(ageNum) || ageNum < 19 || ageNum > 100) {
      setError("Age must be between 19 and 100");
      return;
    }
    if (!location.trim()) {
      setError("Location is required");
      return;
    }

    setSaving(true);
    try {
      await updateProfile({
        nickname: nickname.trim(),
        bio: bio.trim(),
        gender,
        age: ageNum,
        language,
        location: location.trim(),
        profilePhoto,
      });
      router.replace("/(tabs)");
    } catch (e) {
      Alert.alert("오류", "프로필 저장 중 문제가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: botPad + 20 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => {
              Alert.alert("가입 중단", "처음 화면으로 돌아가시겠습니까?", [
                { text: "취소", style: "cancel" },
                {
                  text: "확인",
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await logout();
                      router.replace("/");
                    } catch (e) {
                      router.replace("/");
                    }
                  },
                },
              ]);
            }}
            style={({ pressed }) => [
              styles.backButton,
              { opacity: pressed ? 0.5 : 1 },
            ]}
          >
            <Ionicons
              name="chevron-back"
              size={28}
              color={Colors.textPrimary}
            />
          </Pressable>
        </View>

        <Text style={styles.heading}>{t(lang, "setup_profile")}</Text>
        <Text style={styles.subheading}>Tell us about yourself</Text>

        <Pressable style={styles.photoSection} onPress={pickPhoto}>
          {profilePhoto ? (
            <Image source={{ uri: profilePhoto }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <LinearGradient
                colors={[Colors.backgroundElevated, Colors.backgroundCard]}
                style={StyleSheet.absoluteFill}
              />
              <Ionicons name="camera" size={32} color={Colors.textSecondary} />
              <Text style={styles.photoLabel}>{t(lang, "select_photo")}</Text>
            </View>
          )}
          <View style={styles.photoEditBadge}>
            <Ionicons name="pencil" size={14} color="#fff" />
          </View>
        </Pressable>

        <View style={styles.section}>
          <Text style={styles.label}>{t(lang, "nickname")} *</Text>
          <TextInput
            style={styles.input}
            value={nickname}
            onChangeText={setNickname}
            placeholder="Your nickname"
            placeholderTextColor={Colors.textMuted}
            maxLength={20}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[
              styles.input,
              { minHeight: 80, textAlignVertical: "top", paddingTop: 14 },
            ]}
            value={bio}
            onChangeText={setBio}
            placeholder="Tell others about yourself..."
            placeholderTextColor={Colors.textMuted}
            multiline
            maxLength={120}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t(lang, "gender")} *</Text>
          <View style={styles.row}>
            {(["male", "female"] as Gender[]).map((g) => (
              <Pressable
                key={g}
                style={[
                  styles.choiceBtn,
                  gender === g && styles.choiceSelected,
                ]}
                onPress={() => setGender(g)}
              >
                <Ionicons
                  name={g === "male" ? "male" : "female"}
                  size={18}
                  color={gender === g ? "#fff" : Colors.textSecondary}
                />
                <Text
                  style={[
                    styles.choiceText,
                    gender === g && styles.choiceTextSelected,
                  ]}
                >
                  {t(lang, g)}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t(lang, "age")} (19–100) *</Text>
          <TextInput
            style={styles.input}
            value={age}
            onChangeText={setAge}
            keyboardType="number-pad"
            placeholder="25"
            placeholderTextColor={Colors.textMuted}
            maxLength={3}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t(lang, "language")}</Text>
          <View style={styles.langRow}>
            {languages.map((l) => (
              <Pressable
                key={l}
                style={[styles.langBtn, language === l && styles.langSelected]}
                onPress={() => setLanguage(l)}
              >
                <Text
                  style={[
                    styles.langText,
                    language === l && styles.langTextSelected,
                  ]}
                >
                  {LANGUAGE_LABELS[l]}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>{t(lang, "location")} *</Text>
          {locationGranted ? (
            <View style={styles.locationGranted}>
              <Ionicons name="location" size={16} color={Colors.teal} />
              <Text style={styles.locationText}>{location}</Text>
            </View>
          ) : (
            <View style={styles.locationCol}>
              <Pressable style={styles.locationBtn} onPress={requestLocation}>
                <Ionicons
                  name="location-outline"
                  size={18}
                  color={Colors.accent}
                />
                <Text style={styles.locationBtnText}>
                  {t(lang, "allow_location")}
                </Text>
              </Pressable>
              <Text style={styles.locationOr}>— or type manually —</Text>
              <TextInput
                style={styles.input}
                value={location}
                onChangeText={setLocation}
                placeholder="Your city"
                placeholderTextColor={Colors.textMuted}
              />
            </View>
          )}
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [
            styles.saveBtn,
            { opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={handleSave}
          disabled={saving}
        >
          <LinearGradient
            colors={[Colors.accent, "#c01f5d"]}
            style={styles.saveBtnGrad}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={styles.saveBtnText}>
              {saving ? "Saving..." : t(lang, "save")}
            </Text>
          </LinearGradient>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  scroll: { paddingHorizontal: 24, gap: 8 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    marginBottom: 4,
  },
  backButton: { marginLeft: -10, padding: 8 },
  heading: {
    fontSize: 30,
    fontFamily: "Nunito_800ExtraBold",
    color: Colors.textPrimary,
    marginTop: 16,
    marginBottom: 4,
  },
  subheading: {
    fontSize: 15,
    fontFamily: "Nunito_400Regular",
    color: Colors.textSecondary,
    marginBottom: 24,
  },
  photoSection: { alignSelf: "center", marginBottom: 28, position: "relative" },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderColor: Colors.border,
    gap: 4,
  },
  photoLabel: {
    fontSize: 10,
    color: Colors.textSecondary,
    fontFamily: "Nunito_600SemiBold",
  },
  photoEditBadge: {
    position: "absolute",
    bottom: 4,
    right: 4,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  section: { gap: 8, marginBottom: 20 },
  label: {
    fontSize: 13,
    fontFamily: "Nunito_700Bold",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  input: {
    backgroundColor: Colors.inputBackground,
    borderWidth: 1,
    borderColor: Colors.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: Colors.textPrimary,
    fontFamily: "Nunito_400Regular",
    fontSize: 16,
  },
  row: { flexDirection: "row", gap: 12 },
  choiceBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBackground,
  },
  choiceSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  choiceText: {
    fontFamily: "Nunito_700Bold",
    fontSize: 15,
    color: Colors.textSecondary,
  },
  choiceTextSelected: { color: "#fff" },
  langRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  langBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.inputBackground,
  },
  langSelected: { backgroundColor: Colors.teal, borderColor: Colors.teal },
  langText: {
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  langTextSelected: { color: "#1a1a1f" },
  locationGranted: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: Colors.inputBackground,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.teal,
  },
  locationText: {
    color: Colors.teal,
    fontFamily: "Nunito_600SemiBold",
    fontSize: 15,
  },
  locationCol: { gap: 10 },
  locationBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  locationBtnText: {
    color: Colors.accent,
    fontFamily: "Nunito_700Bold",
    fontSize: 15,
  },
  locationOr: {
    textAlign: "center",
    color: Colors.textMuted,
    fontFamily: "Nunito_400Regular",
    fontSize: 12,
  },
  error: {
    color: Colors.danger,
    fontFamily: "Nunito_600SemiBold",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 4,
  },
  saveBtn: { borderRadius: 16, overflow: "hidden", marginTop: 8 },
  saveBtnGrad: {
    paddingVertical: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontFamily: "Nunito_800ExtraBold",
    fontSize: 17,
    letterSpacing: 0.3,
  },
});
