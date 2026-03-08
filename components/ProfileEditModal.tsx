import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Modal,
  TextInput,
  Alert,
  ScrollView,
  Platform,
  SafeAreaView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { Colors } from "@/constants/colors";
import { t, Language } from "@/constants/i18n";

interface Props {
  visible: boolean;
  onClose: () => void;
}

const NICKNAME_CHANGE_COST = 50;
const MAX_RECORDING_SECONDS = 90;

export function ProfileEditModal({ visible, onClose }: Props) {
  const { user, updateProfile, spendCoins, logout } = useAuth();

  const lang = useMemo(() => (user?.language || "ko") as Language, [user?.language]);

  // ✅ 초기값은 빈 값으로 두되
  const [nickname, setNickname] = useState("");
  const [bio, setBio] = useState("");
  const [tempVoiceUrl, setTempVoiceUrl] = useState("");

  // ✅ [수정 핵심] 유저 데이터가 로드되거나 모달이 열릴 때 상태를 동기화합니다.
  useEffect(() => {
    if (visible && user) {
      setNickname(user.nickname || "");
      setBio(user.bio || "");
      setTempVoiceUrl(user.voiceIntroUrl || "");
    }
  }, [visible, user]);

  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordTime, setRecordTime] = useState(0); 
  const timerRef = useRef<number | null>(null);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [sound]);

  const nicknameChanged = nickname.trim() !== user?.nickname;

  async function pickPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t(lang, "allow_location"), "Permission needed for photo access");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled) {
      await updateProfile({ profilePhoto: result.assets[0].uri });
    }
  }

  async function startRecording() {
    try {
      const perm = await Audio.requestPermissionsAsync();
      if (perm.status !== "granted") return;
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording: newRecording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(newRecording);
      setIsRecording(true);
      setRecordTime(0);
      timerRef.current = window.setInterval(() => {
        setRecordTime((prev) => {
          if (prev >= MAX_RECORDING_SECONDS - 1) {
            stopRecording();
            return MAX_RECORDING_SECONDS;
          }
          return prev + 1;
        });
      }, 1000);
      if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (err) { console.error(err); }
  }

  async function stopRecording() {
    if (!recording) return;
    try {
      setIsRecording(false);
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      if (uri) setTempVoiceUrl(uri);
      setRecording(null);
    } catch (err) { console.error(err); }
  }

  async function playTestVoice() {
    if (!tempVoiceUrl) return;
    try {
      if (sound) await sound.unloadAsync();
      const { sound: newSound } = await Audio.Sound.createAsync({ uri: tempVoiceUrl });
      setSound(newSound);
      setIsPlaying(true);
      await newSound.playAsync();
      newSound.setOnPlaybackStatusUpdate((s) => {
        if (s.isLoaded && s.didJustFinish) setIsPlaying(false);
      });
    } catch (err) { console.error(err); }
  }

  function deleteVoice() {
    Alert.alert(t(lang, "cancel"), t(lang, "voice_intro") + "?", [
      { text: t(lang, "cancel"), style: "cancel" },
      { text: t(lang, "back"), style: "destructive", onPress: () => setTempVoiceUrl("") },
    ]);
  }

  async function handleSave() {
    if (!nickname.trim()) {
      Alert.alert("Error", t(lang, "nickname") + " is required.");
      return;
    }
    const performUpdate = async () => {
      setSaving(true);
      try {
        if (nicknameChanged) {
          const ok = await spendCoins(NICKNAME_CHANGE_COST);
          if (!ok) return;
        }
        await updateProfile({
          nickname: nickname.trim(),
          bio: bio.trim(),
          voiceIntroUrl: tempVoiceUrl,
        });
        onClose();
      } finally { setSaving(false); }
    };
    if (nicknameChanged) {
      if ((user?.coins ?? 0) < NICKNAME_CHANGE_COST) {
        Alert.alert(t(lang, "coins_required"), `${NICKNAME_CHANGE_COST} coins.`);
        return;
      }
      Alert.alert(t(lang, "edit_profile"), `${NICKNAME_CHANGE_COST} coins. Confirm?`, [
        { text: t(lang, "cancel"), style: "cancel" },
        { text: t(lang, "save"), onPress: performUpdate },
      ]);
    } else { await performUpdate(); }
  }

  async function handleLogout() {
    Alert.alert(t(lang, "logout"), "Are you sure?", [
      { text: t(lang, "cancel"), style: "cancel" },
      { text: t(lang, "logout"), style: "destructive", onPress: async () => { await logout(); onClose(); } },
    ]);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={15}><Text style={styles.cancelText}>{t(lang, "cancel")}</Text></Pressable>
          <Text style={styles.title}>{t(lang, "edit_profile")}</Text>
          <Pressable onPress={handleSave} disabled={saving} hitSlop={15}>
            <Text style={[styles.saveText, saving && { opacity: 0.5 }]}>{saving ? "..." : t(lang, "save")}</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Pressable style={styles.photoSection} onPress={pickPhoto}>
            {user?.profilePhoto ? (
              <Image source={{ uri: user.profilePhoto }} style={styles.photo} />
            ) : (
              <View style={styles.photoPlaceholder}><Ionicons name="camera" size={28} color={Colors.textMuted} /></View>
            )}
            <View style={styles.photoBadge}><Ionicons name="pencil" size={12} color="#fff" /></View>
          </Pressable>

          <View style={styles.field}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>{t(lang, "nickname")}</Text>
              <View style={styles.costTag}>
                <Ionicons name="star" size={11} color={Colors.gold} />
                <Text style={styles.costTagText}>{NICKNAME_CHANGE_COST} {t(lang, "coins")}</Text>
              </View>
            </View>
            <TextInput style={styles.input} value={nickname} onChangeText={setNickname} maxLength={20} />
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>Bio</Text>
            <TextInput style={[styles.input, styles.bioInput]} value={bio} onChangeText={setBio} multiline placeholder={t(lang, "post_something")} placeholderTextColor={Colors.textMuted} maxLength={120} textAlignVertical="top" />
            <Text style={styles.charCount}>{bio.length}/120</Text>
          </View>

          <View style={styles.field}>
            <View style={styles.fieldLabelRow}>
              <Text style={styles.fieldLabel}>{t(lang, "voice_intro")}</Text>
              {isRecording && <Text style={styles.timerText}>{recordTime}s / 90s</Text>}
            </View>
            {!tempVoiceUrl ? (
              <Pressable style={({ pressed }) => [styles.recordBtn, isRecording && styles.recordingActive]} onPressIn={startRecording} onPressOut={stopRecording}>
                <Ionicons name={isRecording ? "mic" : "mic-outline"} size={22} color="#fff" />
                <Text style={styles.recordBtnText}>{isRecording ? "Recording..." : t(lang, "hold_to_record")}</Text>
              </Pressable>
            ) : (
              <View style={styles.voiceCard}>
                <Pressable style={styles.voicePlayPart} onPress={playTestVoice}>
                  <Ionicons name={isPlaying ? "pause-circle" : "play-circle"} size={36} color={Colors.accent} />
                  <View>
                    <Text style={styles.voiceTitle}>{t(lang, "voice_intro")}</Text>
                    <Text style={styles.voiceSub}>Tap to play</Text>
                  </View>
                </Pressable>
                <Pressable style={styles.deleteBtn} onPress={deleteVoice}><Ionicons name="trash-outline" size={20} color={Colors.danger} /></Pressable>
              </View>
            )}
          </View>

          <View style={styles.field}>
            <Text style={styles.fieldLabel}>{t(lang, "gender")}</Text>
            <View style={[styles.input, styles.disabledInput]}>
              <Text style={styles.disabledInputText}>{user?.gender === "male" ? t(lang, "male") : t(lang, "female")}</Text>
              <Ionicons name="lock-closed" size={14} color={Colors.textMuted} />
            </View>
          </View>

          <Pressable style={styles.logoutBtn} onPress={handleLogout}>
            <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
            <Text style={styles.logoutBtnText}>{t(lang, "logout")}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 60 : 10, paddingBottom: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: 17, fontWeight: "700", color: Colors.textPrimary },
  cancelText: { fontSize: 15, color: Colors.textSecondary },
  saveText: { fontSize: 15, fontWeight: "700", color: Colors.accent },
  body: { padding: 24, gap: 24 },
  photoSection: { alignSelf: "center", position: "relative", marginBottom: 12 },
  photo: { width: 88, height: 88, borderRadius: 44, borderWidth: 2, borderColor: Colors.accent },
  photoPlaceholder: { width: 88, height: 88, borderRadius: 44, backgroundColor: Colors.backgroundCard, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.border },
  photoBadge: { position: "absolute", bottom: 2, right: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.accent, alignItems: "center", justifyContent: "center" },
  field: { gap: 10 },
  fieldLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: Colors.textMuted, textTransform: "uppercase", letterSpacing: 0.8 },
  costTag: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(245,200,66,0.1)", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  costTagText: { fontSize: 11, fontWeight: "600", color: Colors.gold },
  input: { backgroundColor: Colors.inputBackground, borderWidth: 1, borderColor: Colors.inputBorder, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: Colors.textPrimary, fontSize: 15 },
  bioInput: { minHeight: 90, paddingTop: 14 },
  charCount: { fontSize: 11, color: Colors.textMuted, textAlign: "right" },
  timerText: { color: Colors.danger, fontWeight: '700', fontSize: 14 },
  recordBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.textMuted, paddingVertical: 16, borderRadius: 12, gap: 8 },
  recordingActive: { backgroundColor: Colors.danger },
  recordBtnText: { color: '#fff', fontWeight: "700", fontSize: 14 },
  voiceCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: Colors.backgroundCard, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: Colors.border },
  voicePlayPart: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  voiceTitle: { fontSize: 14, fontWeight: '700', color: Colors.textPrimary },
  voiceSub: { fontSize: 12, color: Colors.textMuted },
  deleteBtn: { padding: 8, backgroundColor: '#fff0f0', borderRadius: 10 },
  disabledInput: { backgroundColor: Colors.backgroundCard, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', opacity: 0.8 },
  disabledInputText: { color: Colors.textSecondary, fontSize: 15 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 30, paddingVertical: 16, borderRadius: 12, borderWidth: 1, borderColor: Colors.danger + "40" },
  logoutBtnText: { color: Colors.danger, fontWeight: "700", fontSize: 16 },
});