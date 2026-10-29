"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { api, type Me } from "./client";

type Session = {
  me: Me | null | undefined;
  loading: boolean;
  error: string;
  refresh: () => Promise<Me | null>;
  signOut: () => Promise<void>;
};
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [me, setMe] = useState<Me | null>();
  const [error, setError] = useState("");
  const request = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++request.current;
    try {
      const player = await api<Me | null>("/api/me");
      if (current === request.current) {
        setMe(player);
        setError("");
      }
      return player;
    } catch (e) {
      if (current === request.current)
        setError("Could not check your session. Please try again.");
      throw e;
    }
  }, []);
  const signOut = useCallback(async () => {
    await api("/api/auth/sign-out", {});
    await api("/api/guest/sign-out", {});
    ++request.current;
    setMe(null);
    setError("");
    await refresh().catch(() => {});
  }, [refresh]);
  useEffect(() => {
    void refresh().catch(() => {});
  }, [pathname, refresh]);
  useEffect(() => {
    const check = () => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    };
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [refresh]);
  return (
    <SessionContext.Provider
      value={{ me, loading: me === undefined, error, refresh, signOut }}
    >
      {error && (
        <div className="session-error" role="alert">
          {error}{" "}
          <button onClick={() => void refresh().catch(() => {})}>
            Retry session
          </button>
        </div>
      )}
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw Error("SessionProvider is required");
  return session;
}

export function SessionStatus() {
  const { error } = useSession();
  return (
    <span role="status">
      {error ? "Session unavailable." : "Checking session…"}
    </span>
  );
}
