import { createAgoraRtcEngine, IRtcEngine } from "react-native-agora";

let engine: IRtcEngine | null = null;

export function getAgoraEngine(): IRtcEngine {
  if (!engine) {
    engine = createAgoraRtcEngine();
  }
  return engine;
}

export function destroyAgoraEngine() {
  if (engine) {
    try {
      engine.release();
    } catch (e) {
      console.log("[Agora] release error:", e);
    }
    engine = null;
  }
}