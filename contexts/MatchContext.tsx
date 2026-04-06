import React, {
  createContext,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

export type MatchStatus = "idle" | "searching" | "found";

export interface MatchUser {
  id: string;
  nickname: string;
  gender?: "male" | "female";
  age?: number;
  location?: string;
  profilePhoto?: string;
  fcmToken?: string;
  distanceKm?: number;
  language?: string;
  isOnline?: boolean;
}

interface MatchContextValue {
  status: MatchStatus;
  isSearching: boolean;
  foundUser: MatchUser | null;
  startMatching: () => void;
  stopMatching: () => void;
  setFoundUser: (user: MatchUser) => void;
  resetMatch: () => void;
  registerCancelHandler: (handler: (() => Promise<void> | void) | null) => void;
  cancelMatchingGlobally: () => Promise<void>;
}

const MatchContext = createContext<MatchContextValue | null>(null);

export function MatchProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<MatchStatus>("idle");
  const [foundUser, setFoundUserState] = useState<MatchUser | null>(null);
  const cancelHandlerRef = useRef<(() => Promise<void> | void) | null>(null);

  const startMatching = () => {
    setFoundUserState(null);
    setStatus("searching");
  };

  const stopMatching = () => {
    setFoundUserState(null);
    setStatus("idle");
  };

  const setFoundUser = (user: MatchUser) => {
    setFoundUserState(user);
    setStatus("found");
  };

  const resetMatch = () => {
    setFoundUserState(null);
    setStatus("idle");
  };

  const registerCancelHandler = (handler: (() => Promise<void> | void) | null) => {
    cancelHandlerRef.current = handler;
  };

  const cancelMatchingGlobally = async () => {
    try {
      if (cancelHandlerRef.current) {
        await cancelHandlerRef.current();
      }
    } finally {
      setFoundUserState(null);
      setStatus("idle");
    }
  };

  const value = useMemo(
    () => ({
      status,
      isSearching: status === "searching",
      foundUser,
      startMatching,
      stopMatching,
      setFoundUser,
      resetMatch,
      registerCancelHandler,
      cancelMatchingGlobally,
    }),
    [status, foundUser]
  );

  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}

export function useMatch() {
  const ctx = useContext(MatchContext);
  if (!ctx) {
    throw new Error("useMatch must be used within MatchProvider");
  }
  return ctx;
}
