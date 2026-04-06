import React from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Colors } from "@/constants/colors";

const REPORT_REASONS = [
  "욕설 및 혐오 발언",
  "스팸 및 광고",
  "음란물 및 부적절한 콘텐츠",
  "사기 및 허위 정보",
  "개인정보 침해",
  "기타",
];

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: (withReport: boolean) => void;
  selectedReason: string | null;
  onSelectReason: (reason: string | null) => void;
}

export default function BlockReportModal({ visible, onClose, onConfirm, selectedReason, onSelectReason }: Props) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>차단 / 신고</Text>
          <Text style={styles.sub}>
            신고 사유를 선택하면 차단과 함께 신고됩니다.{"\n"}
            사유를 선택하지 않아도 차단할 수 있습니다.
          </Text>

          <ScrollView style={styles.reasonList} showsVerticalScrollIndicator={false}>
            {REPORT_REASONS.map((r) => (
              <Pressable
                key={r}
                style={[styles.reasonItem, selectedReason === r && styles.reasonItemActive]}
                onPress={() => onSelectReason(selectedReason === r ? null : r)}
              >
                <View style={[styles.radioCircle, selectedReason === r && styles.radioCircleActive]}>
                  {selectedReason === r && <View style={styles.radioDot} />}
                </View>
                <Text style={[styles.reasonText, selectedReason === r && styles.reasonTextActive]}>{r}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.btnRow}>
            <Pressable style={styles.cancelBtn} onPress={onClose}>
              <Text style={styles.cancelText}>취소</Text>
            </Pressable>
            <Pressable style={styles.blockOnlyBtn} onPress={() => onConfirm(false)}>
              <Text style={styles.blockOnlyText}>차단만</Text>
            </Pressable>
            <Pressable style={styles.blockReportBtn} onPress={() => onConfirm(true)}>
              <LinearGradient colors={[Colors.danger, "#b01010"]} style={styles.blockReportGrad}>
                <Text style={styles.blockReportText}>차단 및 신고</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: { backgroundColor: Colors.backgroundCard, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  handle: { width: 40, height: 4, backgroundColor: Colors.border, borderRadius: 2, alignSelf: "center", marginBottom: 20 },
  title: { fontSize: 20, fontWeight: "800", color: Colors.textPrimary, marginBottom: 8 },
  sub: { fontSize: 13, color: Colors.textMuted, lineHeight: 19, marginBottom: 20 },
  reasonList: { maxHeight: 280 },
  reasonItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: Colors.border },
  reasonItemActive: { backgroundColor: "rgba(232,70,124,0.06)", borderRadius: 10, borderBottomColor: "transparent" },
  radioCircle: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: Colors.border, alignItems: "center", justifyContent: "center" },
  radioCircleActive: { borderColor: Colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: Colors.accent },
  reasonText: { fontSize: 15, color: Colors.textSecondary },
  reasonTextActive: { color: Colors.textPrimary, fontWeight: "600" },
  btnRow: { flexDirection: "row", gap: 8, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, alignItems: "center" },
  cancelText: { color: Colors.textMuted, fontWeight: "600" },
  blockOnlyBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.danger, alignItems: "center" },
  blockOnlyText: { color: Colors.danger, fontWeight: "700" },
  blockReportBtn: { flex: 1, borderRadius: 12, overflow: "hidden" },
  blockReportGrad: { paddingVertical: 14, alignItems: "center" },
  blockReportText: { color: "#fff", fontWeight: "700" },
});